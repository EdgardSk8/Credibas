import type { Db } from '../db';
import { newId } from '../lib/crypto';
import { nextSequence } from './sequences';
import type { ScheduledInstallment } from '../../shared/finance/types';

export interface LoanRow {
  id: string;
  org_id: string;
  client_id: string;
  code: string;
  currency: 'NIO' | 'USD';
  exchange_rate_micros: number | null;
  principal_cents: number;
  interest_rate_bps: number;
  interest_type: 'flat' | 'declining';
  amortization_method: 'flat_interest' | 'fixed_installment' | 'declining_principal';
  installment_count: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
  custom_days: number | null;
  disbursement_date: string;
  first_due_date: string;
  total_interest_cents: number;
  total_fee_cents: number;
  total_to_pay_cents: number;
  late_fee_daily_bps: number;
  grace_days: number;
  schedule_version: number;
  status: 'draft' | 'active' | 'settled' | 'defaulted' | 'cancelled' | 'restructured';
  notes: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  settled_at: number | null;
  deleted_at: number | null;
}

export interface LoanListRow extends LoanRow {
  client_name: string;
  client_phone: string | null;
  paid_cents: number;
  outstanding_cents: number;
  overdue_cents: number;
  overdue_count: number;
  next_due_date: string | null;
}

export interface InstallmentRow {
  id: string;
  org_id: string;
  loan_id: string;
  version: number;
  number: number;
  due_date: string;
  principal_cents: number;
  interest_cents: number;
  fee_cents: number;
  total_cents: number;
  paid_principal_cents: number;
  paid_interest_cents: number;
  paid_fee_cents: number;
  paid_late_fee_cents: number;
  late_fee_accrued_cents: number;
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'restructured' | 'cancelled';
  paid_at: number | null;
  created_at: number;
  updated_at: number;
}

export const OUTSTANDING_SQL = `(i.principal_cents + i.interest_cents + i.fee_cents
  - i.paid_principal_cents - i.paid_interest_cents - i.paid_fee_cents)`;

const LOAN_METRICS_SQL = `
  (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
    WHERE p.loan_id = l.id AND p.status = 'confirmed') AS paid_cents,
  (SELECT COALESCE(SUM(${OUTSTANDING_SQL}), 0) FROM installments i
    WHERE i.loan_id = l.id AND i.version = l.schedule_version
      AND i.status IN ('pending', 'partial', 'overdue')) AS outstanding_cents,
  (SELECT COALESCE(SUM(${OUTSTANDING_SQL}), 0) FROM installments i
    WHERE i.loan_id = l.id AND i.version = l.schedule_version
      AND i.status IN ('pending', 'partial', 'overdue') AND i.due_date < ?) AS overdue_cents,
  (SELECT COUNT(*) FROM installments i
    WHERE i.loan_id = l.id AND i.version = l.schedule_version
      AND i.status IN ('pending', 'partial', 'overdue') AND i.due_date < ?) AS overdue_count,
  (SELECT MIN(i.due_date) FROM installments i
    WHERE i.loan_id = l.id AND i.version = l.schedule_version
      AND i.status IN ('pending', 'partial', 'overdue')) AS next_due_date`;

const LOAN_COLUMNS = `l.id, l.org_id, l.client_id, l.code, l.currency, l.exchange_rate_micros, l.principal_cents,
  l.interest_rate_bps, l.interest_type, l.amortization_method, l.installment_count, l.frequency, l.custom_days,
  l.disbursement_date, l.first_due_date, l.total_interest_cents, l.total_fee_cents, l.total_to_pay_cents,
  l.late_fee_daily_bps, l.grace_days, l.schedule_version, l.status, l.notes, l.created_by, l.created_at,
  l.updated_at, l.settled_at, l.deleted_at`;

export interface LoanListFilters {
  search?: string;
  status?: string;
  clientId?: string;
  overdueOnly?: boolean;
  page: number;
  pageSize: number;
  sort?: string;
  direction: 'asc' | 'desc';
}

const SORTABLE: Record<string, string> = {
  createdAt: 'l.created_at',
  code: 'l.code',
  principal: 'l.principal_cents',
  total: 'l.total_to_pay_cents',
  nextDue: 'next_due_date',
};

export async function listLoans(
  db: Db,
  orgId: string,
  today: string,
  filters: LoanListFilters,
): Promise<{ items: LoanListRow[]; total: number }> {
  const where: string[] = ['l.org_id = ?', 'l.deleted_at IS NULL'];
  const params: Array<string | number> = [orgId];

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'overdue') {
      where.push(`l.status = 'active'`);
      where.push(`EXISTS (SELECT 1 FROM installments i WHERE i.loan_id = l.id AND i.version = l.schedule_version
        AND i.status IN ('pending', 'partial', 'overdue') AND i.due_date < ?)`);
      params.push(today);
    } else if (['draft', 'active', 'settled', 'defaulted', 'cancelled', 'restructured'].includes(filters.status)) {
      where.push('l.status = ?');
      params.push(filters.status);
    }
  }
  if (filters.clientId) {
    where.push('l.client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.search) {
    where.push(`(l.code LIKE ? OR c.full_name LIKE ?)`);
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  const whereSql = where.join(' AND ');
  const total = await db.count(
    `SELECT COUNT(*) AS total FROM loans l JOIN clients c ON c.id = l.client_id WHERE ${whereSql}`,
    params,
  );

  const orderColumn = SORTABLE[filters.sort ?? ''] ?? 'l.created_at';
  const direction = filters.direction === 'asc' ? 'ASC' : 'DESC';

  const items = await db.all<LoanListRow>(
    `SELECT ${LOAN_COLUMNS}, c.full_name AS client_name, c.phone AS client_phone, ${LOAN_METRICS_SQL}
       FROM loans l
       JOIN clients c ON c.id = l.client_id
      WHERE ${whereSql}
      ORDER BY ${orderColumn} ${direction}
      LIMIT ? OFFSET ?`,
    [today, today, ...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { items, total };
}

export async function getLoan(db: Db, orgId: string, loanId: string, today: string): Promise<LoanListRow | null> {
  return db.first<LoanListRow>(
    `SELECT ${LOAN_COLUMNS}, c.full_name AS client_name, c.phone AS client_phone, ${LOAN_METRICS_SQL}
       FROM loans l
       JOIN clients c ON c.id = l.client_id
      WHERE l.org_id = ? AND l.id = ? AND l.deleted_at IS NULL`,
    [today, today, orgId, loanId],
  );
}

export interface CreateLoanRecord {
  loan: Omit<LoanRow, 'id' | 'created_at' | 'updated_at' | 'settled_at' | 'deleted_at' | 'schedule_version'>;
  schedule: ScheduledInstallment[];
  scheduleVersionReason: string;
}

export async function createLoan(db: Db, orgId: string, record: CreateLoanRecord, userId: string, now: number): Promise<string> {
  const loanId = newId('lon');
  const code = await nextSequence(db, orgId, 'loan', 'PRE');
  const loan = record.loan;

  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [
    {
      sql: `INSERT INTO loans (id, org_id, client_id, code, currency, exchange_rate_micros, principal_cents,
              interest_rate_bps, interest_type, amortization_method, installment_count, frequency, custom_days,
              disbursement_date, first_due_date, total_interest_cents, total_fee_cents, total_to_pay_cents,
              late_fee_daily_bps, grace_days, schedule_version, status, notes, created_by, created_at, updated_at,
              settled_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL)`,
      params: [
        loanId,
        orgId,
        loan.client_id,
        code,
        loan.currency,
        loan.exchange_rate_micros,
        loan.principal_cents,
        loan.interest_rate_bps,
        loan.interest_type,
        loan.amortization_method,
        loan.installment_count,
        loan.frequency,
        loan.custom_days,
        loan.disbursement_date,
        loan.first_due_date,
        loan.total_interest_cents,
        loan.total_fee_cents,
        loan.total_to_pay_cents,
        loan.late_fee_daily_bps,
        loan.grace_days,
        loan.status,
        loan.notes,
        userId,
        now,
        now,
      ],
    },
    {
      sql: `INSERT INTO loan_schedule_versions (id, org_id, loan_id, version, reason, created_by, created_at)
            VALUES (?, ?, ?, 1, ?, ?, ?)`,
      params: [newId('lsv'), orgId, loanId, record.scheduleVersionReason, userId, now],
    },
  ];

  for (const installment of record.schedule) {
    statements.push({
      sql: `INSERT INTO installments (id, org_id, loan_id, version, number, due_date, principal_cents, interest_cents,
              fee_cents, total_cents, paid_principal_cents, paid_interest_cents, paid_fee_cents, paid_late_fee_cents,
              late_fee_accrued_cents, status, paid_at, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'pending', NULL, ?, ?)`,
      params: [
        newId('ins'),
        orgId,
        loanId,
        installment.number,
        installment.dueDate,
        installment.principalCents,
        installment.interestCents,
        installment.feeCents,
        installment.totalCents,
        now,
        now,
      ],
    });
  }

  await db.batch(statements);
  return loanId;
}

export async function listInstallments(db: Db, orgId: string, loanId: string, version?: number): Promise<InstallmentRow[]> {
  return db.all<InstallmentRow>(
    `SELECT i.id, i.org_id, i.loan_id, i.version, i.number, i.due_date, i.principal_cents, i.interest_cents, i.fee_cents,
            i.total_cents, i.paid_principal_cents, i.paid_interest_cents, i.paid_fee_cents, i.paid_late_fee_cents,
            i.late_fee_accrued_cents, i.status, i.paid_at, i.created_at, i.updated_at
       FROM installments i
       JOIN loans l ON l.id = i.loan_id
      WHERE i.org_id = ? AND i.loan_id = ? AND i.version = COALESCE(?, l.schedule_version)
      ORDER BY i.number ASC`,
    [orgId, loanId, version ?? null],
  );
}

export interface InstallmentListRow extends InstallmentRow {
  loan_code: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  currency: 'NIO' | 'USD';
  outstanding_cents: number;
}

export interface InstallmentFilters {
  status?: string;
  from?: string;
  to?: string;
  clientId?: string;
  loanId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export async function listInstallmentsGlobal(
  db: Db,
  orgId: string,
  today: string,
  filters: InstallmentFilters,
): Promise<{ items: InstallmentListRow[]; total: number }> {
  const where: string[] = ['i.org_id = ?', `i.version = l.schedule_version`, `l.deleted_at IS NULL`];
  const params: Array<string | number> = [orgId];

  if (filters.status === 'overdue') {
    where.push(`i.status IN ('pending', 'partial', 'overdue') AND i.due_date < ?`);
    params.push(today);
  } else if (filters.status && filters.status !== 'all') {
    where.push('i.status = ?');
    params.push(filters.status);
  }
  if (filters.from) {
    where.push('i.due_date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('i.due_date <= ?');
    params.push(filters.to);
  }
  if (filters.clientId) {
    where.push('l.client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.loanId) {
    where.push('l.id = ?');
    params.push(filters.loanId);
  }
  if (filters.search) {
    where.push(`(l.code LIKE ? OR c.full_name LIKE ?)`);
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  const whereSql = where.join(' AND ');
  const total = await db.count(
    `SELECT COUNT(*) AS total FROM installments i
       JOIN loans l ON l.id = i.loan_id
       JOIN clients c ON c.id = l.client_id
      WHERE ${whereSql}`,
    params,
  );

  const items = await db.all<InstallmentListRow>(
    `SELECT i.id, i.org_id, i.loan_id, i.version, i.number, i.due_date, i.principal_cents, i.interest_cents,
            i.fee_cents, i.total_cents, i.paid_principal_cents, i.paid_interest_cents, i.paid_fee_cents,
            i.paid_late_fee_cents, i.late_fee_accrued_cents, i.status, i.paid_at, i.created_at, i.updated_at,
            l.code AS loan_code, l.client_id, c.full_name AS client_name, c.phone AS client_phone, l.currency,
            ${OUTSTANDING_SQL} AS outstanding_cents
       FROM installments i
       JOIN loans l ON l.id = i.loan_id
       JOIN clients c ON c.id = l.client_id
      WHERE ${whereSql}
      ORDER BY i.due_date ASC, i.number ASC
      LIMIT ? OFFSET ?`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { items, total };
}

export async function getInstallment(db: Db, orgId: string, installmentId: string): Promise<InstallmentRow | null> {
  return db.first<InstallmentRow>(
    `SELECT id, org_id, loan_id, version, number, due_date, principal_cents, interest_cents, fee_cents, total_cents,
            paid_principal_cents, paid_interest_cents, paid_fee_cents, paid_late_fee_cents, late_fee_accrued_cents,
            status, paid_at, created_at, updated_at
       FROM installments WHERE org_id = ? AND id = ?`,
    [orgId, installmentId],
  );
}

export async function setLoanStatus(
  db: Db,
  orgId: string,
  loanId: string,
  status: LoanRow['status'],
  now: number,
  settledAt: number | null = null,
): Promise<void> {
  await db.run(`UPDATE loans SET status = ?, settled_at = ?, updated_at = ? WHERE org_id = ? AND id = ?`, [
    status,
    settledAt,
    now,
    orgId,
    loanId,
  ]);
}

export async function countActiveLoans(db: Db, orgId: string): Promise<number> {
  return db.count(`SELECT COUNT(*) AS total FROM loans WHERE org_id = ? AND status = 'active' AND deleted_at IS NULL`, [
    orgId,
  ]);
}

export async function listLoansByClient(db: Db, orgId: string, clientId: string, today: string): Promise<LoanListRow[]> {
  return db.all<LoanListRow>(
    `SELECT ${LOAN_COLUMNS}, c.full_name AS client_name, c.phone AS client_phone, ${LOAN_METRICS_SQL}
       FROM loans l
       JOIN clients c ON c.id = l.client_id
      WHERE l.org_id = ? AND l.client_id = ? AND l.deleted_at IS NULL
      ORDER BY l.created_at DESC`,
    [today, today, orgId, clientId],
  );
}

export interface NewScheduleVersionInput {
  loanId: string;
  version: number;
  reason: string;
  installments: ScheduledInstallment[];
  totals: { totalInterestCents: number; totalFeeCents: number; totalToPayCents: number };
  installmentCount: number;
  firstDueDate: string;
  userId: string;
}

/**
 * Crea una nueva versión del calendario sin destruir la anterior. Las cuotas
 * impagas de la versión previa quedan como "reestructuradas" y se conserva el
 * historial de pagos.
 */
export async function createScheduleVersion(
  db: Db,
  orgId: string,
  input: NewScheduleVersionInput,
  now: number,
): Promise<void> {
  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [
    {
      sql: `INSERT INTO loan_schedule_versions (id, org_id, loan_id, version, reason, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [newId('lsv'), orgId, input.loanId, input.version, input.reason, input.userId, now],
    },
    {
      sql: `UPDATE installments
               SET status = 'restructured', updated_at = ?
             WHERE org_id = ? AND loan_id = ? AND version = ?
               AND status IN ('pending', 'partial', 'overdue')
               AND (principal_cents + interest_cents + fee_cents
                    - paid_principal_cents - paid_interest_cents - paid_fee_cents) > 0`,
      params: [now, orgId, input.loanId, input.version - 1],
    },
    {
      sql: `UPDATE loans
               SET schedule_version = ?, installment_count = ?, first_due_date = ?,
                   total_interest_cents = ?, total_fee_cents = ?, total_to_pay_cents = ?,
                   status = 'active', settled_at = NULL, updated_at = ?
             WHERE org_id = ? AND id = ?`,
      params: [
        input.version,
        input.installmentCount,
        input.firstDueDate,
        input.totals.totalInterestCents,
        input.totals.totalFeeCents,
        input.totals.totalToPayCents,
        now,
        orgId,
        input.loanId,
      ],
    },
  ];

  for (const installment of input.installments) {
    statements.push({
      sql: `INSERT INTO installments (id, org_id, loan_id, version, number, due_date, principal_cents, interest_cents,
              fee_cents, total_cents, paid_principal_cents, paid_interest_cents, paid_fee_cents, paid_late_fee_cents,
              late_fee_accrued_cents, status, paid_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'pending', NULL, ?, ?)`,
      params: [
        newId('ins'),
        orgId,
        input.loanId,
        input.version,
        installment.number,
        installment.dueDate,
        installment.principalCents,
        installment.interestCents,
        installment.feeCents,
        installment.totalCents,
        now,
        now,
      ],
    });
  }

  await db.batch(statements);
}

export async function refreshOverdueInstallments(db: Db, orgId: string, today: string, now: number): Promise<number> {
  const result = await db.run(
    `UPDATE installments SET status = 'overdue', updated_at = ?
      WHERE org_id = ? AND status = 'pending' AND due_date < ?`,
    [now, orgId, today],
  );
  return result.meta.changes ?? 0;
}
