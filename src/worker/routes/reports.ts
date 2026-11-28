import { Hono } from 'hono';
import type { Context } from 'hono';
import { dbFrom } from '../db';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { todayInTimezone } from '../../shared/finance/dates';
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
import { buildXlsx, safeFileName, type XlsxCell } from '../lib/xlsx';
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
  const upcoming = await getUpcomingInstallments(db, orgId, today, 8);
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

reportRoutes.get('/export/portfolio.xlsx', requirePermission(PERMISSIONS.reportsExport), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const orgName = c.get('orgName') as string;
  const requested = (c.req.query('currency') ?? c.get('orgCurrency') ?? 'NIO').toUpperCase();
  const currency: 'NIO' | 'USD' = requested === 'USD' ? 'USD' : 'NIO';
  const { today } = resolveRange(c);

  const report = await getPortfolioReport(db, orgId, currency);
  const aging = await getAgingReport(db, orgId, currency);

  const money = (cents: number) => cents / 100;
  const moneyCell = (cents: number) => ({ value: money(cents), format: 'money' as const, align: 'right' as const, border: true });
  const numberCell = (value: number) => ({ value, format: 'integer' as const, align: 'right' as const, border: true });

  const header = (labels: string[]): XlsxCell[] =>
    labels.map((label, index) => ({
      value: label,
      bold: true,
      color: '3B2E00',
      fill: 'F1E0A6',
      border: true,
      align: index === 0 ? ('left' as const) : ('right' as const),
    }));

  const agingTotal = aging.reduce(
    (sum, bucket) => ({ count: sum.count + bucket.count, amount: sum.amount + bucket.amountCents }),
    { count: 0, amount: 0 },
  );

  const rows: XlsxCell[][] = [
    [{ value: orgName, bold: true, size: 16, color: '17211F' }],
    [{ value: 'Reporte de cartera', bold: true, size: 12, color: '4A5A55' }],
    [
      {
        value: `Al ${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)} · ${currency === 'USD' ? 'Dólares (USD)' : 'Córdobas (NIO)'}`,
        color: '6C7B76',
      },
    ],
    [],
    header(['Indicador', 'Valor']),
    [{ value: 'Capital colocado', border: true }, moneyCell(report.totalPrincipalCents)],
    [{ value: 'Capital recuperado', border: true }, moneyCell(report.totalRecoveredCents)],
    [{ value: 'Intereses generados', border: true }, moneyCell(report.totalInterestCents)],
    [{ value: 'Intereses cobrados', border: true }, moneyCell(report.totalInterestCollectedCents)],
    [{ value: 'Saldo pendiente', border: true }, moneyCell(report.outstandingCents)],
    [{ value: 'Saldo vencido', border: true }, moneyCell(report.overdueCents)],
    [{ value: 'Préstamos activos', border: true }, numberCell(report.activeLoans)],
    [{ value: 'Préstamos liquidados', border: true }, numberCell(report.settledLoans)],
    [{ value: 'Préstamos vencidos', border: true }, numberCell(report.overdueLoans)],
    [
      { value: 'Morosidad', border: true },
      { value: report.morosityPercent, format: 'percent', align: 'right', border: true },
    ],
    [],
    [{ value: 'Distribución por atraso', bold: true, size: 12, color: '17211F' }],
    header(['Rango de atraso', 'Cuotas', 'Monto']),
    ...aging.map((bucket) => [
      { value: bucket.bucket, border: true },
      numberCell(bucket.count),
      moneyCell(bucket.amountCents),
    ]),
    [
      { value: 'Total', bold: true, border: true },
      { value: agingTotal.count, format: 'integer' as const, bold: true, align: 'right' as const, border: true },
      { value: money(agingTotal.amount), format: 'money' as const, bold: true, align: 'right' as const, border: true },
    ],
  ];

  const workbook = buildXlsx(
    {
      name: 'Cartera',
      columns: [{ width: 34 }, { width: 22 }, { width: 20 }, { width: 14 }],
      rows,
      heights: [26, 18, 16, 6],
      merges: ['A1:D1', 'A2:D2', 'A3:D3', 'A16:D16'],
      freezeRows: 5,
    },
    { currency },
  );

  const fileName = `Cartera - ${safeFileName(orgName)} - ${today}.xlsx`;
  return new Response(workbook as unknown as BodyInit, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'content-length': String(workbook.byteLength),
    },
  });
});
