import type { Db } from '../db';
import type { Env } from '../env';
import type { JobMessage } from '../jobs/types';
import { AppError } from '../lib/errors';
import { allocateExtraPrincipal, allocatePayment } from '../../shared/finance/allocation';
import { calculateLateFeeCents } from '../../shared/finance/late-fees';
import { addFrequency, compareDateOnly, todayInTimezone } from '../../shared/finance/dates';
import { generateSchedule } from '../../shared/finance/schedule';
import { formatMoney } from '../../shared/finance/money';
import type { AllocationOrder } from '../../shared/finance/types';
import type { PaymentInput } from '../../shared/validation';
import { createScheduleVersion, getLoan, listInstallments, type InstallmentRow, type LoanListRow } from '../repositories/loans';
import {
  createPaymentWithAllocations,
  getPayment,
  listPaymentAllocations,
  reversePayment as reversePaymentRecord,
  type AllocationWrite,
} from '../repositories/payments';
import { getOrgSetting } from '../repositories/organizations';
import { addMovement, getOpenRegister } from '../repositories/cash';
import { writeAudit } from '../repositories/audit';
import { getClient } from '../repositories/clients';
import { assertSubscriptionWritable } from './limits';
import { paymentReceiptEmail } from './emails';
import type { LoanContext } from './loan-service';

const OPEN_STATUSES = ['pending', 'partial', 'overdue'];
const DEFAULT_ORDER: AllocationOrder = ['late_fee', 'interest', 'principal', 'fee'];

interface OrgPreferences {
  allocationOrder?: AllocationOrder;
}

export async function accrueLateFees(
  db: Db,
  orgId: string,
  loan: LoanListRow,
  installments: InstallmentRow[],
  asOfDate: string,
  now: number,
): Promise<InstallmentRow[]> {
  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [];

  for (const installment of installments) {
    if (!OPEN_STATUSES.includes(installment.status)) continue;
    const paid = installment.paid_principal_cents + installment.paid_interest_cents + installment.paid_fee_cents;
    const fee = calculateLateFeeCents({
      totalCents: installment.total_cents,
      paidCents: paid,
      dueDate: installment.due_date,
      asOfDate,
      dailyBps: loan.late_fee_daily_bps,
      graceDays: loan.grace_days,
    });

    if (fee !== installment.late_fee_accrued_cents) {
      installment.late_fee_accrued_cents = fee;
      statements.push({
        sql: `UPDATE installments SET late_fee_accrued_cents = ?, updated_at = ? WHERE org_id = ? AND id = ?`,
        params: [fee, now, orgId, installment.id],
      });
    }
  }

  if (statements.length > 0) await db.batch(statements);
  return installments;
}

export interface RegisterPaymentResult {
  paymentId: string;
  appliedCents: number;
  loanSettled: boolean;
  reamortizedVersion: number | null;
}

export async function registerPayment(
  env: Env,
  db: Db,
  context: LoanContext,
  input: PaymentInput,
  now: number,
): Promise<RegisterPaymentResult> {
  assertSubscriptionWritable(context.subscriptionStatus);

  const today = todayInTimezone(context.orgTimezone);
  const loan = await getLoan(db, context.orgId, input.loanId, today);
  if (!loan) throw AppError.notFound('El préstamo no existe en esta organización');
  if (loan.status === 'settled') throw AppError.conflict('Este préstamo ya está liquidado');
  if (loan.status !== 'active') throw AppError.conflict('Solo se pueden registrar pagos en préstamos activos');

  const allInstallments = await listInstallments(db, context.orgId, input.loanId, loan.schedule_version);
  const open = allInstallments.filter((item) => OPEN_STATUSES.includes(item.status));
  if (open.length === 0) throw AppError.conflict('El préstamo no tiene cuotas pendientes');

  await accrueLateFees(db, context.orgId, loan, open, input.paidAt, now);

  const outstandingCents = open.reduce(
    (total, item) =>
      total +
      Math.max(0, item.principal_cents - item.paid_principal_cents) +
      Math.max(0, item.interest_cents - item.paid_interest_cents) +
      Math.max(0, item.fee_cents - item.paid_fee_cents) +
      Math.max(0, item.late_fee_accrued_cents - item.paid_late_fee_cents),
    0,
  );

  if (input.amountCents > outstandingCents) {
    throw AppError.badRequest(
      `El monto excede el saldo pendiente (${formatMoney(outstandingCents, loan.currency)}). Ajusta el monto o registra un abono a capital.`,
      { outstandingCents, amountCents: input.amountCents },
    );
  }

  let allocations: AllocationWrite[] = [];

  if (input.mode === 'capital') {
    const result = allocateExtraPrincipal(
      open.map((item) => ({ id: item.id, dueDate: item.due_date, principalCents: item.principal_cents, paidPrincipalCents: item.paid_principal_cents, status: item.status })),
      input.amountCents,
    );
    if (result.unappliedCents > 0) {
      throw AppError.badRequest('El abono excede el capital pendiente', { unappliedCents: result.unappliedCents });
    }
    allocations = result.allocations.map((item) => ({
      installmentId: item.installmentId,
      principalCents: item.principalCents,
      interestCents: 0,
      feeCents: 0,
      lateFeeCents: 0,
    }));
  } else {
    const preferences = (await getOrgSetting<OrgPreferences>(db, context.orgId, 'org.preferences')) ?? {};
    const order = preferences.allocationOrder?.length ? preferences.allocationOrder : DEFAULT_ORDER;
    const result = allocatePayment({
      amountCents: input.amountCents,
      order,
      installments: open.map((item) => ({
        id: item.id,
        dueDate: item.due_date,
        totalCents: item.total_cents,
        principalCents: item.principal_cents,
        feeCents: item.fee_cents,
        paidPrincipalCents: item.paid_principal_cents,
        paidInterestCents: item.paid_interest_cents,
        paidFeeCents: item.paid_fee_cents,
        paidLateFeeCents: item.paid_late_fee_cents,
        lateFeeAccruedCents: item.late_fee_accrued_cents,
      })),
    });
    if (result.unappliedCents > 0) {
      throw AppError.badRequest('No pudimos aplicar el pago completo. Verifica el saldo pendiente.', {
        unappliedCents: result.unappliedCents,
      });
    }
    allocations = result.lines.map((line) => ({
      installmentId: line.installmentId,
      principalCents: line.principalCents,
      interestCents: line.interestCents,
      feeCents: line.feeCents,
      lateFeeCents: line.lateFeeCents,
    }));
  }

  const applied = allocations.reduce(
    (total, item) => total + item.principalCents + item.interestCents + item.feeCents + item.lateFeeCents,
    0,
  );
  if (applied <= 0) throw AppError.badRequest('El pago no tiene componentes aplicables');

  const paymentId = await createPaymentWithAllocations(
    db,
    {
      orgId: context.orgId,
      clientId: loan.client_id,
      loanId: loan.id,
      amountCents: applied,
      currency: loan.currency,
      method: input.method,
      reference: input.reference,
      paidAt: input.paidAt,
      notes: input.notes,
      userId: context.userId,
      allocations,
    },
    now,
  );

  if (input.method === 'cash' && loan.currency === context.orgCurrency) {
    const register = await getOpenRegister(db, context.orgId);
    if (register) {
      await addMovement(
        db,
        {
          orgId: context.orgId,
          registerId: register.id,
          direction: 'in',
          category: input.mode === 'capital' ? 'capital' : 'cuota',
          amountCents: applied,
          currency: loan.currency,
          sourceType: 'payment',
          sourceId: paymentId,
          description: `Pago de ${loan.client_name} · ${loan.code}`,
          userId: context.userId,
        },
        now,
      );
    }
  }

  let reamortizedVersion: number | null = null;

  if (input.mode === 'capital') {
    reamortizedVersion = await reamortizeRemaining(db, context, loan, today, now);
  }

  const updated = await getLoan(db, context.orgId, loan.id, today);
  const loanSettled = updated?.status === 'settled';

  await writeAudit(
    db,
    {
      orgId: context.orgId,
      actorUserId: context.userId,
      action: input.mode === 'capital' ? 'payment.capital' : 'payment.created',
      entityType: 'payment',
      entityId: paymentId,
      after: { loanId: loan.id, amountCents: applied, method: input.method, paidAt: input.paidAt, allocations },
      ip: context.ip,
      userAgent: context.userAgent,
    },
    now,
  );

  const client = await getClient(db, context.orgId, loan.client_id);
  if (client?.email) {
    const receipt = paymentReceiptEmail(
      client.full_name,
      context.orgName,
      formatMoney(applied, loan.currency),
      loan.code,
      input.paidAt,
    );
    await env.JOBS.send({
      type: 'email.send',
      to: client.email,
      subject: receipt.subject,
      text: receipt.text,
      html: receipt.html,
    } satisfies JobMessage);
  }

  return { paymentId, appliedCents: applied, loanSettled, reamortizedVersion };
}

async function reamortizeRemaining(
  db: Db,
  context: LoanContext,
  loan: LoanListRow,
  today: string,
  now: number,
): Promise<number | null> {
  const installments = await listInstallments(db, context.orgId, loan.id, loan.schedule_version);
  const open = installments.filter((item) => OPEN_STATUSES.includes(item.status));
  const remainingPrincipal = open.reduce((total, item) => total + Math.max(0, item.principal_cents - item.paid_principal_cents), 0);
  if (remainingPrincipal <= 0 || open.length === 0) return null;

  const upcoming = open
    .map((item) => item.due_date)
    .filter((due) => compareDateOnly(due, today) >= 0)
    .sort()[0];
  const firstDueDate = upcoming ?? addFrequency(today, loan.frequency, loan.custom_days);

  const schedule = generateSchedule({
    principalCents: remainingPrincipal,
    interestRateBps: loan.interest_rate_bps,
    installmentCount: Math.max(1, open.length),
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
      loanId: loan.id,
      version,
      reason: 'Abono a capital',
      installments: schedule.installments,
      totals: {
        totalInterestCents: schedule.totalInterestCents,
        totalFeeCents: schedule.totalFeeCents,
        totalToPayCents: schedule.totalToPayCents,
      },
      installmentCount: Math.max(1, open.length),
      firstDueDate,
      userId: context.userId,
    },
    now,
  );

  return version;
}

export async function reversePaymentService(
  env: Env,
  db: Db,
  context: LoanContext,
  paymentId: string,
  reason: string,
  now: number,
): Promise<void> {
  void env;
  const payment = await getPayment(db, context.orgId, paymentId);
  if (!payment) throw AppError.notFound('El pago no existe');
  if (payment.status === 'reversed') throw AppError.conflict('Este pago ya fue revertido');

  const allocations = await listPaymentAllocations(db, context.orgId, paymentId);

  await reversePaymentRecord(
    db,
    { orgId: context.orgId, paymentId, loanId: payment.loan_id, reason, userId: context.userId },
    now,
  );

  if (payment.method === 'cash' && payment.currency === context.orgCurrency) {
    const register = await getOpenRegister(db, context.orgId);
    if (register) {
      await addMovement(
        db,
        {
          orgId: context.orgId,
          registerId: register.id,
          direction: 'out',
          category: 'ajuste',
          amountCents: payment.amount_cents,
          currency: payment.currency,
          sourceType: 'adjustment',
          sourceId: paymentId,
          description: `Reversión de pago ${payment.loan_code}`,
          userId: context.userId,
        },
        now,
      );
    }
  }

  await writeAudit(
    db,
    {
      orgId: context.orgId,
      actorUserId: context.userId,
      action: 'payment.reversed',
      entityType: 'payment',
      entityId: paymentId,
      before: { amountCents: payment.amount_cents, allocations },
      after: { reason },
      ip: context.ip,
      userAgent: context.userAgent,
    },
    now,
  );
}

export { createLoan } from '../repositories/loans';
