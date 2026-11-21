import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { paginated, parseBody, parseQuery } from '../middleware/core';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { paymentInputSchema, reversePaymentSchema } from '../../shared/validation';
import { paginationSchema } from '../../shared/validation';
import { getPayment, listPaymentAllocations, listPayments } from '../repositories/payments';
import { getInstallment } from '../repositories/loans';
import { registerPayment, reversePaymentService } from '../services/payment-service';
import { mapPayment, toCsv } from './mappers';
import { buildLoanContext } from './helpers';
import { formatMoney } from '../../shared/finance/money';
import { todayInTimezone } from '../../shared/finance/dates';
import type { AppEnv } from '../types';

export const paymentRoutes = new Hono<AppEnv>();

paymentRoutes.use('*', requireAuth, requireOrg);

paymentRoutes.get('/', requirePermission(PERMISSIONS.paymentsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const query = parseQuery(c, paginationSchema);
  const url = new URL(c.req.url);

  const { items, total } = await listPayments(db, c.get('orgId') as string, {
    search: query.search,
    status: query.status,
    method: url.searchParams.get('method') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    loanId: url.searchParams.get('loanId') ?? undefined,
    clientId: url.searchParams.get('clientId') ?? undefined,
    page: query.page,
    pageSize: query.pageSize,
  });

  return c.json(paginated(items.map((item) => mapPayment(item)), query.page, query.pageSize, total));
});

paymentRoutes.post('/', requirePermission(PERMISSIONS.paymentsWrite), async (c) => {
  const db = dbFrom(c.env.DB);
  const context = await buildLoanContext(c);
  const input = await parseBody(c, paymentInputSchema);

  const result = await registerPayment(c.env, db, context, input, Date.now());
  return c.json({ ok: true, ...result }, 201);
});

paymentRoutes.get('/export.csv', requirePermission(PERMISSIONS.reportsExport), async (c) => {
  const db = dbFrom(c.env.DB);
  const today = todayInTimezone(c.get('orgTimezone'));
  const { items } = await listPayments(db, c.get('orgId') as string, { page: 1, pageSize: 10_000 });

  const rows = items.map((item) => [
    item.paid_at,
    item.loan_code,
    item.client_name,
    formatMoney(item.amount_cents, item.currency),
    item.method,
    item.reference,
    item.status,
    item.created_by_name,
  ]);

  const csv = toCsv(['Fecha', 'Préstamo', 'Cliente', 'Monto', 'Método', 'Referencia', 'Estado', 'Registrado por'], rows);

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="pagos-${today}.csv"`,
    },
  });
});

paymentRoutes.get('/:id', requirePermission(PERMISSIONS.paymentsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;

  const payment = await getPayment(db, orgId, c.req.param('id'));
  if (!payment) throw AppError.notFound('Pago no encontrado');

  const allocations = await listPaymentAllocations(db, orgId, payment.id);
  const detailed = await Promise.all(
    allocations.map(async (allocation) => {
      const installment = await getInstallment(db, orgId, allocation.installment_id);
      return { ...allocation, installmentNumber: installment?.number ?? 0 };
    }),
  );

  const summary = mapPayment(payment);
  return c.json({
    payment: {
      ...summary,
      allocations: detailed.map((item) => ({
        installmentId: item.installment_id,
        installmentNumber: item.installmentNumber,
        principalCents: item.principal_cents,
        interestCents: item.interest_cents,
        feeCents: item.fee_cents,
        lateFeeCents: item.late_fee_cents,
      })),
    },
  });
});

paymentRoutes.post('/:id/reverse', requirePermission(PERMISSIONS.paymentsReverse), async (c) => {
  const db = dbFrom(c.env.DB);
  const context = await buildLoanContext(c);
  const input = await parseBody(c, reversePaymentSchema);

  await reversePaymentService(c.env, db, context, c.req.param('id'), input.reason, Date.now());
  return c.json({ ok: true, message: 'Pago revertido y registrado en auditoría.' });
});
