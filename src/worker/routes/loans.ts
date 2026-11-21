import { Hono } from 'hono';
import { z } from 'zod';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { paginated, parseBody, parseQuery } from '../middleware/core';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { loanAdjustmentSchema, loanInputSchema, paginationSchema } from '../../shared/validation';
import { generateSchedule } from '../../shared/finance/schedule';
import { todayInTimezone } from '../../shared/finance/dates';
import { getLoan, listInstallments, listLoans } from '../repositories/loans';
import { listPayments } from '../repositories/payments';
import { adjustLoan, cancelLoan, createLoanForOrganization } from '../services/loan-service';
import { mapInstallment, mapLoan, mapPayment, toCsv } from './mappers';
import { buildLoanContext } from './helpers';
import { formatMoney, bpsToPercent } from '../../shared/finance/money';
import type { AppEnv } from '../types';

export const loanRoutes = new Hono<AppEnv>();

loanRoutes.use('*', requireAuth, requireOrg);

const previewSchema = z
  .object({
    principalCents: z.number().int().positive(),
    interestRateBps: z.number().int().min(0).max(10_000),
    amortizationMethod: z.enum(['flat_interest', 'fixed_installment', 'declining_principal']),
    installmentCount: z.number().int().min(1).max(520),
    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
    customDays: z.number().int().positive().max(365).nullable().optional(),
    firstDueDate: z.iso.date(),
    feeCents: z.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === 'custom' && !value.customDays) {
      ctx.addIssue({ code: 'custom', path: ['customDays'], message: 'Indica cada cuántos días se cobra' });
    }
  });

loanRoutes.post('/preview', requirePermission(PERMISSIONS.loansRead), async (c) => {
  const input = await parseBody(c, previewSchema);
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

  return c.json({
    schedule: schedule.installments,
    totals: {
      totalPrincipalCents: schedule.totalPrincipalCents,
      totalInterestCents: schedule.totalInterestCents,
      totalFeeCents: schedule.totalFeeCents,
      totalToPayCents: schedule.totalToPayCents,
      annualizedRateBps: schedule.annualizedRateBps,
    },
  });
});

loanRoutes.get('/', requirePermission(PERMISSIONS.loansRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const query = parseQuery(c, paginationSchema);
  const orgId = c.get('orgId') as string;
  const today = todayInTimezone(c.get('orgTimezone'));
  const clientId = new URL(c.req.url).searchParams.get('clientId') ?? undefined;

  const { items, total } = await listLoans(db, orgId, today, {
    search: query.search,
    status: query.status,
    clientId,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    direction: query.direction,
  });

  return c.json(paginated(items.map(mapLoan), query.page, query.pageSize, total));
});

loanRoutes.post('/', requirePermission(PERMISSIONS.loansWrite), async (c) => {
  const db = dbFrom(c.env.DB);
  const context = await buildLoanContext(c);
  const input = await parseBody(c, loanInputSchema);

  const { loanId } = await createLoanForOrganization(c.env, db, context, input, Date.now());
  return c.json({ ok: true, loanId }, 201);
});

loanRoutes.get('/export.csv', requirePermission(PERMISSIONS.reportsExport), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const today = todayInTimezone(c.get('orgTimezone'));

  const { items } = await listLoans(db, orgId, today, { page: 1, pageSize: 10_000, direction: 'desc' });
  const rows = items.map((row) => [
    row.code,
    row.client_name,
    row.currency,
    formatMoney(row.principal_cents, row.currency),
    `${bpsToPercent(row.interest_rate_bps)}%`,
    row.installment_count,
    row.frequency,
    row.disbursement_date,
    formatMoney(row.total_to_pay_cents, row.currency),
    formatMoney(Number(row.outstanding_cents ?? 0), row.currency),
    formatMoney(Number(row.overdue_cents ?? 0), row.currency),
    row.status,
  ]);

  const csv = toCsv(
    ['Código', 'Cliente', 'Moneda', 'Capital', 'Tasa período', 'Cuotas', 'Frecuencia', 'Desembolso', 'Total a pagar', 'Saldo pendiente', 'Saldo vencido', 'Estado'],
    rows,
  );

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="prestamos-${today}.csv"`,
    },
  });
});

loanRoutes.get('/:id', requirePermission(PERMISSIONS.loansRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const today = todayInTimezone(c.get('orgTimezone'));

  const loan = await getLoan(db, orgId, c.req.param('id'), today);
  if (!loan) throw AppError.notFound('Préstamo no encontrado');

  const installments = await listInstallments(db, orgId, loan.id, loan.schedule_version);
  const payments = await listPayments(db, orgId, { loanId: loan.id, page: 1, pageSize: 100 });

  return c.json({
    loan: mapLoan(loan),
    installments: installments.map(mapInstallment),
    payments: payments.items.map((payment) => mapPayment(payment)),
  });
});

loanRoutes.get('/:id/installments', requirePermission(PERMISSIONS.loansRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const today = todayInTimezone(c.get('orgTimezone'));
  const loan = await getLoan(db, orgId, c.req.param('id'), today);
  if (!loan) throw AppError.notFound('Préstamo no encontrado');

  const installments = await listInstallments(db, orgId, loan.id, loan.schedule_version);
  return c.json({ items: installments.map(mapInstallment), loan: mapLoan(loan) });
});

loanRoutes.get('/:id/payments', requirePermission(PERMISSIONS.paymentsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const result = await listPayments(db, orgId, { loanId: c.req.param('id'), page: 1, pageSize: 100 });
  return c.json({ items: result.items.map((payment) => mapPayment(payment)) });
});

loanRoutes.post('/:id/adjust', requirePermission(PERMISSIONS.loansAdjust), async (c) => {
  const db = dbFrom(c.env.DB);
  const context = await buildLoanContext(c);
  const input = await parseBody(c, loanAdjustmentSchema);

  const result = await adjustLoan(c.env, db, context, c.req.param('id'), input, Date.now());
  return c.json({ ok: true, version: result.version });
});

loanRoutes.post('/:id/cancel', requirePermission(PERMISSIONS.loansCancel), async (c) => {
  const db = dbFrom(c.env.DB);
  const context = await buildLoanContext(c);
  const body = await c.req.json<{ reason?: string }>();
  if (!body.reason || body.reason.trim().length < 5) {
    throw AppError.badRequest('Indica el motivo de la cancelación');
  }

  await cancelLoan(db, context, c.req.param('id'), body.reason.trim(), Date.now());
  return c.json({ ok: true });
});
