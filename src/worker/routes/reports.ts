import { Hono } from 'hono';
import type { Context } from 'hono';
import { dbFrom } from '../db';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { todayInTimezone } from '../../shared/finance/dates';
import { formatMoney } from '../../shared/finance/money';
import {
  getAgingReport,
  getCashflowReport,
  getDashboardTotals,
  getMonthlySeries,
  getPaymentsByPeriod,
  getPortfolioReport,
  getRecentActivity,
  getUpcomingInstallments,
} from '../repositories/reports';
import { toCsv } from './mappers';
import type { AppEnv } from '../types';

export const reportRoutes = new Hono<AppEnv>();

reportRoutes.use('*', requireAuth, requireOrg);

function resolveRange(c: Context<AppEnv>, defaultDays = 30) {
  const url = new URL(c.req.url);
  const today = todayInTimezone(c.get('orgTimezone'));
  const to = url.searchParams.get('to') ?? today;
  const from =
    url.searchParams.get('from') ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - defaultDays * 86_400_000).toISOString().slice(0, 10);
  return { from, to, today };
}

reportRoutes.get('/dashboard', requirePermission(PERMISSIONS.reportsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const currency = c.get('orgCurrency') ?? 'NIO';
  const { from, to, today } = resolveRange(c, 30);

  const totals = await getDashboardTotals(db, orgId, from, to, today);
  const upcoming = await getUpcomingInstallments(db, orgId, 8);
  const monthly = await getMonthlySeries(db, orgId, 6);
  const activity = await getRecentActivity(db, orgId, 10);

  return c.json({
    period: { from, to },
    currency,
    totals: {
      capitalDisbursedCents: totals.capital_disbursed_cents,
      capitalRecoveredCents: totals.capital_recovered_cents,
      portfolioOutstandingCents: totals.portfolio_outstanding_cents,
      overdueAmountCents: totals.overdue_amount_cents,
      overdueInstallments: totals.overdue_installments,
      activeLoans: totals.active_loans,
      settledLoans: totals.settled_loans,
      clients: totals.clients,
      expectedTodayCents: totals.expected_today_cents,
      collectedTodayCents: totals.collected_today_cents,
    },
    upcoming: upcoming.map((item) => ({
      installmentId: item.installment_id,
      loanId: item.loan_id,
      loanCode: item.loan_code,
      clientName: item.client_name,
      dueDate: item.due_date,
      totalCents: item.outstanding_cents,
      overdue: item.overdue === 1,
    })),
    monthly,
    recentActivity: activity.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      amountCents: item.amount_cents,
      createdAt: new Date(item.created_at).toISOString(),
      actorName: item.actor_name,
    })),
  });
});

reportRoutes.get('/portfolio', requirePermission(PERMISSIONS.reportsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const currency = (new URL(c.req.url).searchParams.get('currency') ?? c.get('orgCurrency') ?? 'NIO') as 'NIO' | 'USD';
  const report = await getPortfolioReport(db, c.get('orgId') as string, currency);
  return c.json(report);
});

reportRoutes.get('/aging', requirePermission(PERMISSIONS.reportsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const currency = (new URL(c.req.url).searchParams.get('currency') ?? c.get('orgCurrency') ?? 'NIO') as 'NIO' | 'USD';
  const buckets = await getAgingReport(db, c.get('orgId') as string, currency);
  return c.json({ currency, buckets });
});

reportRoutes.get('/payments', requirePermission(PERMISSIONS.reportsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const { from, to } = resolveRange(c, 30);
  const series = await getPaymentsByPeriod(db, c.get('orgId') as string, from, to);
  return c.json({ from, to, series });
});

reportRoutes.get('/cashflow', requirePermission(PERMISSIONS.reportsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const { from, to } = resolveRange(c, 30);
  const series = await getCashflowReport(db, c.get('orgId') as string, from, to);
  return c.json({ from, to, series });
});

reportRoutes.get('/export/portfolio.csv', requirePermission(PERMISSIONS.reportsExport), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const currency = c.get('orgCurrency') ?? 'NIO';
  const { today } = resolveRange(c);

  const report = await getPortfolioReport(db, orgId, currency);
  const aging = await getAgingReport(db, orgId, currency);

  const rows: Array<Array<string | number | null>> = [
    ['Capital colocado', formatMoney(report.totalPrincipalCents, currency)],
    ['Capital recuperado', formatMoney(report.totalRecoveredCents, currency)],
    ['Intereses generados', formatMoney(report.totalInterestCents, currency)],
    ['Intereses cobrados', formatMoney(report.totalInterestCollectedCents, currency)],
    ['Saldo pendiente', formatMoney(report.outstandingCents, currency)],
    ['Saldo vencido', formatMoney(report.overdueCents, currency)],
    ['Préstamos activos', report.activeLoans],
    ['Préstamos liquidados', report.settledLoans],
    ['Préstamos vencidos', report.overdueLoans],
    ['Morosidad %', report.morosityPercent],
    [],
    ['Rango de atraso', 'Cuotas', 'Monto'],
    ...aging.map((bucket) => [bucket.bucket, bucket.count, formatMoney(bucket.amountCents, currency)]),
  ];

  const csv = toCsv(['Indicador', 'Valor'], rows);
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="cartera-${today}.csv"`,
    },
  });
});
