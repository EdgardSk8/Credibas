import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { paginated, parseQuery } from '../middleware/core';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { paginationSchema } from '../../shared/validation';
import { getInstallment, listInstallmentsGlobal } from '../repositories/loans';
import { todayInTimezone } from '../../shared/finance/dates';
import { mapInstallment } from './mappers';
import type { AppEnv } from '../types';

export const installmentRoutes = new Hono<AppEnv>();

installmentRoutes.use('*', requireAuth, requireOrg);

installmentRoutes.get('/', requirePermission(PERMISSIONS.loansRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const query = parseQuery(c, paginationSchema);
  const url = new URL(c.req.url);
  const today = todayInTimezone(c.get('orgTimezone'));

  const { items, total } = await listInstallmentsGlobal(db, orgId, today, {
    status: query.status,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    clientId: url.searchParams.get('clientId') ?? undefined,
    loanId: url.searchParams.get('loanId') ?? undefined,
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
  });

  return c.json(
    paginated(
      items.map((item) => ({
        ...mapInstallment(item),
        loanId: item.loan_id,
        loanCode: item.loan_code,
        clientId: item.client_id,
        clientName: item.client_name,
        clientPhone: item.client_phone,
        currency: item.currency,
      })),
      query.page,
      query.pageSize,
      total,
    ),
  );
});

installmentRoutes.get('/:id', requirePermission(PERMISSIONS.loansRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const installment = await getInstallment(db, c.get('orgId') as string, c.req.param('id'));
  if (!installment) throw AppError.notFound('Cuota no encontrada');
  return c.json({ installment: mapInstallment(installment) });
});
