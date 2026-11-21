import type { Db } from '../db';
import type { Env } from '../env';
import type { JobMessage } from '../jobs/types';
import { AppError } from '../lib/errors';
import { generateSchedule } from '../../shared/finance/schedule';
import { addFrequency, todayInTimezone } from '../../shared/finance/dates';
import type { LoanInput } from '../../shared/validation';
import { assertCanAdd, assertSubscriptionWritable } from './limits';
import { getClient } from '../repositories/clients';
import {
  createLoan,
  createScheduleVersion,
  getLoan,
  listInstallments,
  setLoanStatus,
} from '../repositories/loans';
import { writeAudit } from '../repositories/audit';
import { addMovement, getOpenRegister } from '../repositories/cash';
import { newId } from '../lib/crypto';

export interface LoanContext {
  orgId: string;
  orgName: string;
  orgCurrency: 'NIO' | 'USD';
  orgTimezone: string;
  subscriptionStatus: string;
  userId: string;
  ip: string;
  userAgent: string;
}

export async function createLoanForOrganization(
  env: Env,
  db: Db,
  context: LoanContext,
  input: LoanInput,
  now: number,
): Promise<{ loanId: string }> {
  assertSubscriptionWritable(context.subscriptionStatus);

  const client = await getClient(db, context.orgId, input.clientId);
  if (!client) throw AppError.notFound('El cliente no existe en esta organización');

  await assertCanAdd(db, context.orgId, 'active_loans');

  const schedule = generateSchedule({
    principalCents: input.principalCents,
    interestRateBps: input.interestRateBps,
    installmentCount: input.installmentCount,
    method: input.amortizationMethod,
    frequency: input.frequency,
    customDays: input.customDays ?? null,
    firstDueDate: input.firstDueDate,
    feeCents: input.feeCents,
  });

  const interestType = input.amortizationMethod === 'flat_interest' ? 'flat' : 'declining';

  const loanId = await createLoan(
    db,
    context.orgId,
    {
      loan: {
        org_id: context.orgId,
        client_id: input.clientId,
        code: '',
        currency: input.currency,
        exchange_rate_micros: null,
        principal_cents: input.principalCents,
        interest_rate_bps: input.interestRateBps,
        interest_type: interestType,
        amortization_method: input.amortizationMethod,
        installment_count: input.installmentCount,
        frequency: input.frequency,
        custom_days: input.frequency === 'custom' ? (input.customDays ?? null) : null,
        disbursement_date: input.disbursementDate,
        first_due_date: input.firstDueDate,
        total_interest_cents: schedule.totalInterestCents,
        total_fee_cents: schedule.totalFeeCents,
        total_to_pay_cents: schedule.totalToPayCents,
        late_fee_daily_bps: input.lateFeeDailyBps,
        grace_days: input.graceDays,
        status: 'active',
        notes: input.notes,
        created_by: context.userId,
      },
      schedule: schedule.installments,
      scheduleVersionReason: 'Calendario inicial',
    },
    context.userId,
    now,
  );

  await writeAudit(
    db,
    {
      orgId: context.orgId,
      actorUserId: context.userId,
      action: 'loan.created',
      entityType: 'loan',
      entityId: loanId,
      after: {
        clientId: input.clientId,
        principalCents: input.principalCents,
        installmentCount: input.installmentCount,
        method: input.amortizationMethod,
        totalToPayCents: schedule.totalToPayCents,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    },
    now,
  );

  // Desembolso en efectivo: sale de la caja abierta si la moneda coincide.
  if (input.currency === context.orgCurrency) {
    const register = await getOpenRegister(db, context.orgId);
    if (register) {
      await addMovement(
        db,
        {
          orgId: context.orgId,
          registerId: register.id,
          direction: 'out',
          category: 'capital',
          amountCents: input.principalCents,
          currency: input.currency,
          sourceType: 'loan_disbursement',
          sourceId: loanId,
          description: `Desembolso de préstamo a ${client.full_name}`,
          userId: context.userId,
        },
        now,
      );
    }
  }

  await env.JOBS.send({
    type: 'maintenance.refresh-overdue',
    orgId: context.orgId,
    asOfDate: todayInTimezone(context.orgTimezone),
  } satisfies JobMessage);

  return { loanId };
}

export interface LoanAdjustmentInput {
  reason: string;
  installmentCount?: number;
  interestRateBps?: number;
  firstDueDate?: string;
}

/**
 * Reestructura solo el saldo insoluto. Nunca reescribe cuotas pagadas y deja
 * una versión nueva del calendario más un registro de auditoría.
 */
export async function adjustLoan(
  env: Env,
  db: Db,
  context: LoanContext,
  loanId: string,
  input: LoanAdjustmentInput,
  now: number,
): Promise<{ version: number }> {
  void env;
  assertSubscriptionWritable(context.subscriptionStatus);

  const today = todayInTimezone(context.orgTimezone);
  const loan = await getLoan(db, context.orgId, loanId, today);
  if (!loan) throw AppError.notFound('El préstamo no existe');
  if (!['active', 'defaulted'].includes(loan.status)) {
    throw AppError.conflict('Solo se pueden reestructurar préstamos activos');
  }

  const installments = await listInstallments(db, context.orgId, loanId, loan.schedule_version);
  const open = installments.filter((item) => ['pending', 'partial', 'overdue'].includes(item.status));
  if (open.length === 0) throw AppError.conflict('El préstamo no tiene cuotas pendientes');

  const remainingPrincipal = open.reduce((total, item) => total + (item.principal_cents - item.paid_principal_cents), 0);
  if (remainingPrincipal <= 0) throw AppError.conflict('No queda capital pendiente por reestructurar');

  const firstOpenDue = open.map((item) => item.due_date).sort()[0] as string;
  const firstDueDate = input.firstDueDate ?? (firstOpenDue >= today ? firstOpenDue : addFrequency(today, loan.frequency, loan.custom_days));
  const installmentCount = input.installmentCount ?? open.length;
  const rateBps = input.interestRateBps ?? loan.interest_rate_bps;

  const schedule = generateSchedule({
    principalCents: remainingPrincipal,
    interestRateBps: rateBps,
    installmentCount,
    method: loan.amortization_method,
    frequency: loan.frequency,
    customDays: loan.custom_days,
    firstDueDate,
    feeCents: 0,
  });

  const version = loan.schedule_version + 1;

  await createScheduleVersion(
    db,
    context.orgId,
    {
      loanId,
      version,
      reason: input.reason,
      installments: schedule.installments,
      totals: {
        totalInterestCents: schedule.totalInterestCents,
        totalFeeCents: schedule.totalFeeCents,
        totalToPayCents: schedule.totalToPayCents,
      },
      installmentCount,
      firstDueDate,
      userId: context.userId,
    },
    now,
  );

  await db.run(
    `INSERT INTO loan_adjustments (id, org_id, loan_id, type, reason, amount_cents, data_json, created_by, created_at)
     VALUES (?, ?, ?, 'reschedule', ?, ?, ?, ?, ?)`,
    [
      newId('adj'),
      context.orgId,
      loanId,
      input.reason,
      remainingPrincipal,
      JSON.stringify({ version, installmentCount, rateBps, firstDueDate }),
      context.userId,
      now,
    ],
  );

  await writeAudit(
    db,
    {
      orgId: context.orgId,
      actorUserId: context.userId,
      action: 'loan.restructured',
      entityType: 'loan',
      entityId: loanId,
      before: { version: loan.schedule_version, remainingPrincipal },
      after: { version, installmentCount, rateBps, firstDueDate },
      ip: context.ip,
      userAgent: context.userAgent,
    },
    now,
  );

  return { version };
}

export async function cancelLoan(
  db: Db,
  context: LoanContext,
  loanId: string,
  reason: string,
  now: number,
): Promise<void> {
  const today = todayInTimezone(context.orgTimezone);
  const loan = await getLoan(db, context.orgId, loanId, today);
  if (!loan) throw AppError.notFound('El préstamo no existe');

  const paid = await db.sum(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments
      WHERE org_id = ? AND loan_id = ? AND status = 'confirmed'`,
    [context.orgId, loanId],
  );
  if (paid > 0) {
    throw AppError.conflict('El préstamo tiene pagos registrados. Revierte los pagos antes de cancelarlo.');
  }

  await db.batch([
    {
      sql: `UPDATE installments SET status = 'cancelled', updated_at = ?
             WHERE org_id = ? AND loan_id = ? AND status IN ('pending', 'partial', 'overdue')`,
      params: [now, context.orgId, loanId],
    },
    {
      sql: `INSERT INTO loan_adjustments (id, org_id, loan_id, type, reason, amount_cents, data_json, created_by, created_at)
            VALUES (?, ?, ?, 'cancellation', ?, NULL, '{}', ?, ?)`,
      params: [newId('adj'), context.orgId, loanId, reason, context.userId, now],
    },
  ]);

  await setLoanStatus(db, context.orgId, loanId, 'cancelled', now);

  await writeAudit(
    db,
    {
      orgId: context.orgId,
      actorUserId: context.userId,
      action: 'loan.cancelled',
      entityType: 'loan',
      entityId: loanId,
      after: { reason },
      ip: context.ip,
      userAgent: context.userAgent,
    },
    now,
  );
}
