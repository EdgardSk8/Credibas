import type { Db } from '../db';
import { OUTSTANDING_SQL } from './loans';

const OPEN_INSTALLMENT_STATUSES = `('pending', 'partial', 'overdue')`;

export interface DashboardTotalsRow {
  capital_disbursed_cents: number;
  capital_recovered_cents: number;
  portfolio_outstanding_cents: number;
  overdue_amount_cents: number;
  overdue_installments: number;
  active_loans: number;
  settled_loans: number;
  clients: number;
  expected_today_cents: number;
  collected_today_cents: number;
  interest_generated_cents: number;
  interest_collected_cents: number;
}

export async function getDashboardTotals(
  db: Db,
  orgId: string,
  from: string,
  to: string,
  today: string,
): Promise<DashboardTotalsRow> {
  const row = await db.first<DashboardTotalsRow>(
    `SELECT
      (SELECT COALESCE(SUM(l.principal_cents), 0) FROM loans l
        WHERE l.org_id = ? AND l.deleted_at IS NULL AND l.status <> 'cancelled'
          AND l.disbursement_date BETWEEN ? AND ?) AS capital_disbursed_cents,
      (SELECT COALESCE(SUM(p.principal_cents + p.interest_cents + p.fee_cents + p.late_fee_cents), 0)
         FROM payment_allocations p WHERE p.org_id = ?) AS capital_recovered_cents,
      (SELECT COALESCE(SUM(${OUTSTANDING_SQL}), 0) FROM installments i
         JOIN loans l ON l.id = i.loan_id
        WHERE i.org_id = ? AND i.version = l.schedule_version AND l.status = 'active'
          AND l.deleted_at IS NULL AND i.status IN ${OPEN_INSTALLMENT_STATUSES}) AS portfolio_outstanding_cents,
      (SELECT COALESCE(SUM(${OUTSTANDING_SQL}), 0) FROM installments i
         JOIN loans l ON l.id = i.loan_id
        WHERE i.org_id = ? AND i.version = l.schedule_version AND l.status = 'active'
          AND l.deleted_at IS NULL AND i.status IN ${OPEN_INSTALLMENT_STATUSES} AND i.due_date < ?) AS overdue_amount_cents,
      (SELECT COUNT(*) FROM installments i
         JOIN loans l ON l.id = i.loan_id
        WHERE i.org_id = ? AND i.version = l.schedule_version AND l.status = 'active'
          AND l.deleted_at IS NULL AND i.status IN ${OPEN_INSTALLMENT_STATUSES} AND i.due_date < ?) AS overdue_installments,
      (SELECT COUNT(*) FROM loans l WHERE l.org_id = ? AND l.status = 'active' AND l.deleted_at IS NULL) AS active_loans,
      (SELECT COUNT(*) FROM loans l WHERE l.org_id = ? AND l.status = 'settled' AND l.deleted_at IS NULL
        AND l.settled_at IS NOT NULL AND l.settled_at BETWEEN ? AND ?) AS settled_loans,
      (SELECT COUNT(*) FROM clients c WHERE c.org_id = ? AND c.deleted_at IS NULL) AS clients,
      (SELECT COALESCE(SUM(${OUTSTANDING_SQL}), 0) FROM installments i
         JOIN loans l ON l.id = i.loan_id
        WHERE i.org_id = ? AND i.version = l.schedule_version AND l.status = 'active'
          AND i.due_date = ? AND i.status IN ${OPEN_INSTALLMENT_STATUSES}) AS expected_today_cents,
      (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
        WHERE p.org_id = ? AND p.status = 'confirmed' AND p.paid_at = ?) AS collected_today_cents,
      (SELECT COALESCE(SUM(l.total_interest_cents), 0) FROM loans l
        WHERE l.org_id = ? AND l.deleted_at IS NULL AND l.disbursement_date BETWEEN ? AND ?) AS interest_generated_cents,
      (SELECT COALESCE(SUM(a.interest_cents), 0) FROM payment_allocations a
         JOIN payments p ON p.id = a.payment_id
        WHERE a.org_id = ? AND p.status = 'confirmed' AND p.paid_at BETWEEN ? AND ?) AS interest_collected_cents`,
    [
      orgId, from, to,
      orgId,
      orgId,
      orgId, today,
      orgId, today,
      orgId,
      orgId, Date.parse(`${from}T00:00:00Z`), Date.parse(`${to}T23:59:59Z`),
      orgId,
      orgId, today,
      orgId, today,
      orgId, from, to,
      orgId, from, to,
    ],
  );

  return {
    capital_disbursed_cents: Number(row?.capital_disbursed_cents ?? 0),
    capital_recovered_cents: Number(row?.capital_recovered_cents ?? 0),
    portfolio_outstanding_cents: Number(row?.portfolio_outstanding_cents ?? 0),
    overdue_amount_cents: Number(row?.overdue_amount_cents ?? 0),
    overdue_installments: Number(row?.overdue_installments ?? 0),
    active_loans: Number(row?.active_loans ?? 0),
    settled_loans: Number(row?.settled_loans ?? 0),
    clients: Number(row?.clients ?? 0),
    expected_today_cents: Number(row?.expected_today_cents ?? 0),
    collected_today_cents: Number(row?.collected_today_cents ?? 0),
    interest_generated_cents: Number(row?.interest_generated_cents ?? 0),
    interest_collected_cents: Number(row?.interest_collected_cents ?? 0),
  };
}

export interface UpcomingRow {
  installment_id: string;
  loan_id: string;
  loan_code: string;
  client_name: string;
  due_date: string;
  total_cents: number;
  outstanding_cents: number;
  overdue: number;
  currency: 'NIO' | 'USD';
}

export async function getUpcomingInstallments(db: Db, orgId: string, today: string, limit = 8): Promise<UpcomingRow[]> {
  return db.all<UpcomingRow>(
    `SELECT i.id AS installment_id, l.id AS loan_id, l.code AS loan_code, c.full_name AS client_name,
            i.due_date, i.total_cents, ${OUTSTANDING_SQL} AS outstanding_cents,
            CASE WHEN i.due_date < ? THEN 1 ELSE 0 END AS overdue, l.currency
       FROM installments i
       JOIN loans l ON l.id = i.loan_id
       JOIN clients c ON c.id = l.client_id
      WHERE i.org_id = ? AND i.version = l.schedule_version AND l.status = 'active'
        AND l.deleted_at IS NULL AND i.status IN ${OPEN_INSTALLMENT_STATUSES}
      ORDER BY i.due_date ASC
      LIMIT ?`,
    [today, orgId, limit],
  );
}

export async function getMonthlySeries(db: Db, orgId: string, months: number) {
  const disbursed = await db.all<{ month: string; total: number }>(
    `SELECT substr(disbursement_date, 1, 7) AS month, COALESCE(SUM(principal_cents), 0) AS total
       FROM loans
      WHERE org_id = ? AND deleted_at IS NULL AND status <> 'cancelled'
      GROUP BY substr(disbursement_date, 1, 7) ORDER BY substr(disbursement_date, 1, 7) DESC LIMIT ?`,
    [orgId, months],
  );
  const collected = await db.all<{ month: string; total: number }>(
    `SELECT substr(paid_at, 1, 7) AS month, COALESCE(SUM(amount_cents), 0) AS total
       FROM payments
      WHERE org_id = ? AND status = 'confirmed'
      GROUP BY substr(paid_at, 1, 7) ORDER BY substr(paid_at, 1, 7) DESC LIMIT ?`,
    [orgId, months],
  );

  const map = new Map<string, { month: string; disbursedCents: number; collectedCents: number }>();
  for (const row of disbursed) {
    map.set(row.month, { month: row.month, disbursedCents: Number(row.total), collectedCents: 0 });
  }
  for (const row of collected) {
    const entry = map.get(row.month) ?? { month: row.month, disbursedCents: 0, collectedCents: 0 };
    entry.collectedCents = Number(row.total);
    map.set(row.month, entry);
  }

  return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

export async function getRecentActivity(db: Db, orgId: string, limit = 10) {
  return db.all<{ id: string; type: string; title: string; amount_cents: number | null; created_at: number; actor_name: string | null }>(
    `SELECT * FROM (
       SELECT p.id AS id, 'payment' AS type, 'Pago recibido · ' || l.code AS title,
              p.amount_cents AS amount_cents, p.created_at AS created_at, u.full_name AS actor_name
         FROM payments p
         JOIN loans l ON l.id = p.loan_id
         LEFT JOIN users u ON u.id = p.created_by
        WHERE p.org_id = ? AND p.status = 'confirmed'
       UNION ALL
       SELECT l.id, 'loan', 'Préstamo desembolsado · ' || l.code, l.principal_cents, l.created_at, u.full_name
         FROM loans l
         LEFT JOIN users u ON u.id = l.created_by
        WHERE l.org_id = ? AND l.deleted_at IS NULL
       UNION ALL
       SELECT c.id, 'client', 'Cliente registrado · ' || c.full_name, NULL, c.created_at, u.full_name
         FROM clients c
         LEFT JOIN users u ON u.id = c.created_by
        WHERE c.org_id = ? AND c.deleted_at IS NULL
     ) AS activity
     ORDER BY activity.created_at DESC
     LIMIT ?`,
    [orgId, orgId, orgId, limit],
  );
}

// ---------------------------------------------------------------------------
// Reportes
// ---------------------------------------------------------------------------
export interface PortfolioReport {
  totalPrincipalCents: number;
  totalRecoveredCents: number;
  totalInterestCents: number;
  totalInterestCollectedCents: number;
  outstandingCents: number;
  overdueCents: number;
  activeLoans: number;
  settledLoans: number;
  overdueLoans: number;
  morosityPercent: number;
  currency: 'NIO' | 'USD';
}

export async function getPortfolioReport(db: Db, orgId: string, currency: 'NIO' | 'USD'): Promise<PortfolioReport> {
  const row = await db.first<{
    totalPrincipalCents: number;
    totalRecoveredCents: number;
    totalInterestCents: number;
    totalInterestCollectedCents: number;
    outstandingCents: number;
    overdueCents: number;
    activeLoans: number;
    settledLoans: number;
    overdueLoans: number;
  }>(
    `SELECT
      (SELECT COALESCE(SUM(principal_cents), 0) FROM loans
        WHERE org_id = ? AND currency = ? AND deleted_at IS NULL) AS totalPrincipalCents,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM payments
        WHERE org_id = ? AND currency = ? AND status = 'confirmed') AS totalRecoveredCents,
      (SELECT COALESCE(SUM(total_interest_cents), 0) FROM loans
        WHERE org_id = ? AND currency = ? AND deleted_at IS NULL) AS totalInterestCents,
      (SELECT COALESCE(SUM(a.interest_cents), 0) FROM payment_allocations a
         JOIN payments p ON p.id = a.payment_id
        WHERE a.org_id = ? AND p.currency = ? AND p.status = 'confirmed') AS totalInterestCollectedCents,
      (SELECT COALESCE(SUM(${OUTSTANDING_SQL}), 0) FROM installments i
         JOIN loans l ON l.id = i.loan_id
        WHERE i.org_id = ? AND l.currency = ? AND i.version = l.schedule_version
          AND l.status = 'active' AND l.deleted_at IS NULL AND i.status IN ${OPEN_INSTALLMENT_STATUSES}) AS outstandingCents,
      (SELECT COALESCE(SUM(${OUTSTANDING_SQL}), 0) FROM installments i
         JOIN loans l ON l.id = i.loan_id
        WHERE i.org_id = ? AND l.currency = ? AND i.version = l.schedule_version
          AND l.status = 'active' AND l.deleted_at IS NULL AND i.status IN ${OPEN_INSTALLMENT_STATUSES}
          AND i.due_date < date('now')) AS overdueCents,
      (SELECT COUNT(*) FROM loans WHERE org_id = ? AND currency = ? AND status = 'active' AND deleted_at IS NULL) AS activeLoans,
      (SELECT COUNT(*) FROM loans WHERE org_id = ? AND currency = ? AND status = 'settled' AND deleted_at IS NULL) AS settledLoans,
      (SELECT COUNT(DISTINCT l.id) FROM loans l JOIN installments i ON i.loan_id = l.id
        WHERE l.org_id = ? AND l.currency = ? AND l.status = 'active' AND l.deleted_at IS NULL
          AND i.version = l.schedule_version AND i.due_date < date('now')
          AND i.status IN ${OPEN_INSTALLMENT_STATUSES}) AS overdueLoans`,
    [
      orgId, currency,
      orgId, currency,
      orgId, currency,
      orgId, currency,
      orgId, currency,
      orgId, currency,
      orgId, currency,
      orgId, currency,
      orgId, currency,
    ],
  );

  const outstanding = Number(row?.outstandingCents ?? 0);
  const overdue = Number(row?.overdueCents ?? 0);

  return {
    totalPrincipalCents: Number(row?.totalPrincipalCents ?? 0),
    totalRecoveredCents: Number(row?.totalRecoveredCents ?? 0),
    totalInterestCents: Number(row?.totalInterestCents ?? 0),
    totalInterestCollectedCents: Number(row?.totalInterestCollectedCents ?? 0),
    outstandingCents: outstanding,
    overdueCents: overdue,
    activeLoans: Number(row?.activeLoans ?? 0),
    settledLoans: Number(row?.settledLoans ?? 0),
    overdueLoans: Number(row?.overdueLoans ?? 0),
    morosityPercent: outstanding > 0 ? Math.round((overdue / outstanding) * 1000) / 10 : 0,
    currency,
  };
}

export interface AgingBucket {
  bucket: string;
  count: number;
  amountCents: number;
}

export async function getAgingReport(db: Db, orgId: string, currency: 'NIO' | 'USD'): Promise<AgingBucket[]> {
  const rows = await db.all<{ bucket: string; count: number; amountCents: number }>(
    `SELECT
       CASE
         WHEN julianday(date('now')) - julianday(i.due_date) BETWEEN 0 AND 30 THEN '1-30'
         WHEN julianday(date('now')) - julianday(i.due_date) BETWEEN 31 AND 60 THEN '31-60'
         WHEN julianday(date('now')) - julianday(i.due_date) BETWEEN 61 AND 90 THEN '61-90'
         ELSE '90+'
       END AS bucket,
       COUNT(*) AS count,
       COALESCE(SUM(${OUTSTANDING_SQL}), 0) AS amountCents
     FROM installments i
     JOIN loans l ON l.id = i.loan_id
    WHERE i.org_id = ? AND l.currency = ? AND i.version = l.schedule_version
      AND l.status = 'active' AND l.deleted_at IS NULL
      AND i.status IN ${OPEN_INSTALLMENT_STATUSES} AND i.due_date < date('now')
    GROUP BY bucket`,
    [orgId, currency],
  );

  const order = ['1-30', '31-60', '61-90', '90+'];
  return order.map((bucket) => {
    const found = rows.find((row) => row.bucket === bucket);
    return { bucket, count: Number(found?.count ?? 0), amountCents: Number(found?.amountCents ?? 0) };
  });
}

export async function getPaymentsByPeriod(db: Db, orgId: string, from: string, to: string) {
  return db.all<{ period: string; count: number; totalCents: number }>(
    `SELECT substr(paid_at, 1, 10) AS period, COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS totalCents
       FROM payments
      WHERE org_id = ? AND status = 'confirmed' AND paid_at BETWEEN ? AND ?
      GROUP BY substr(paid_at, 1, 10) ORDER BY substr(paid_at, 1, 10) ASC`,
    [orgId, from, to],
  );
}

export async function getCashflowReport(db: Db, orgId: string, from: string, to: string) {
  return db.all<{ period: string; incomeCents: number; expenseCents: number }>(
    `SELECT substr(date(created_at / 1000, 'unixepoch'), 1, 10) AS period,
            COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
            COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cents ELSE 0 END), 0) AS expenseCents
       FROM cash_movements
      WHERE org_id = ? AND date(created_at / 1000, 'unixepoch') BETWEEN ? AND ?
      GROUP BY substr(date(created_at / 1000, 'unixepoch'), 1, 10)
      ORDER BY substr(date(created_at / 1000, 'unixepoch'), 1, 10) ASC`,
    [orgId, from, to],
  );
}
