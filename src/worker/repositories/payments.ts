import { newId } from '../lib/crypto';
import type { Db } from '../db';

export interface PaymentRow {
  id: string;
  org_id: string;
  client_id: string;
  loan_id: string;
  amount_cents: number;
  currency: 'NIO' | 'USD';
  method: 'cash' | 'transfer' | 'card' | 'other';
  reference: string | null;
  paid_at: string;
  status: 'confirmed' | 'reversed';
  notes: string | null;
  created_by: string | null;
  created_at: number;
  reversed_at: number | null;
  reversed_by: string | null;
  reversal_reason: string | null;
}

export interface PaymentAllocationRow {
  id: string;
  org_id: string;
  payment_id: string;
  installment_id: string;
  principal_cents: number;
  interest_cents: number;
  fee_cents: number;
  late_fee_cents: number;
  created_at: number;
}

export interface PaymentListRow extends PaymentRow {
  loan_code: string;
  client_name: string;
  created_by_name: string | null;
  installment_numbers: string | null;
}

export interface PaymentListFilters {
  search?: string;
  method?: string;
  status?: string;
  from?: string;
  to?: string;
  loanId?: string;
  clientId?: string;
  page: number;
  pageSize: number;
}

export async function listPayments(
  db: Db,
  orgId: string,
  filters: PaymentListFilters,
): Promise<{ items: PaymentListRow[]; total: number }> {
  const where: string[] = ['p.org_id = ?'];
  const params: Array<string | number> = [orgId];

  if (filters.method && ['cash', 'transfer', 'card', 'other'].includes(filters.method)) {
    where.push('p.method = ?');
    params.push(filters.method);
  }
  if (filters.status && ['confirmed', 'reversed'].includes(filters.status)) {
    where.push('p.status = ?');
    params.push(filters.status);
  }
  if (filters.from) {
    where.push('p.paid_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('p.paid_at <= ?');
    params.push(filters.to);
  }
  if (filters.loanId) {
    where.push('p.loan_id = ?');
    params.push(filters.loanId);
  }
  if (filters.clientId) {
    where.push('p.client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.search) {
    where.push('(l.code LIKE ? OR c.full_name LIKE ? OR p.reference LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }

  const whereSql = where.join(' AND ');
  const total = await db.count(
    `SELECT COUNT(*) AS total FROM payments p
       JOIN loans l ON l.id = p.loan_id
       JOIN clients c ON c.id = p.client_id
      WHERE ${whereSql}`,
    params,
  );

  const items = await db.all<PaymentListRow>(
    `SELECT p.id, p.org_id, p.client_id, p.loan_id, p.amount_cents, p.currency, p.method, p.reference, p.paid_at,
            p.status, p.notes, p.created_by, p.created_at, p.reversed_at, p.reversed_by, p.reversal_reason,
            l.code AS loan_code, c.full_name AS client_name, u.full_name AS created_by_name,
            (SELECT GROUP_CONCAT(i.number, ',') FROM payment_allocations a
               JOIN installments i ON i.id = a.installment_id WHERE a.payment_id = p.id) AS installment_numbers
       FROM payments p
       JOIN loans l ON l.id = p.loan_id
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN users u ON u.id = p.created_by
      WHERE ${whereSql}
      ORDER BY p.paid_at DESC, p.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { items, total };
}

export async function getPayment(db: Db, orgId: string, paymentId: string): Promise<PaymentListRow | null> {
  return db.first<PaymentListRow>(
    `SELECT p.id, p.org_id, p.client_id, p.loan_id, p.amount_cents, p.currency, p.method, p.reference, p.paid_at,
            p.status, p.notes, p.created_by, p.created_at, p.reversed_at, p.reversed_by, p.reversal_reason,
            l.code AS loan_code, c.full_name AS client_name, u.full_name AS created_by_name,
            NULL AS installment_numbers
       FROM payments p
       JOIN loans l ON l.id = p.loan_id
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN users u ON u.id = p.created_by
      WHERE p.org_id = ? AND p.id = ?`,
    [orgId, paymentId],
  );
}

export async function listPaymentAllocations(db: Db, orgId: string, paymentId: string): Promise<PaymentAllocationRow[]> {
  return db.all<PaymentAllocationRow>(
    `SELECT id, org_id, payment_id, installment_id, principal_cents, interest_cents, fee_cents, late_fee_cents, created_at
       FROM payment_allocations WHERE org_id = ? AND payment_id = ? ORDER BY created_at ASC`,
    [orgId, paymentId],
  );
}

export interface AllocationWrite {
  installmentId: string;
  principalCents: number;
  interestCents: number;
  feeCents: number;
  lateFeeCents: number;
}

/**
 * Registra un pago y aplica sus componentes a las cuotas en una sola
 * transacción (batch atómico de D1). Los incrementos son relativos para
 * no perder escrituras concurrentes.
 */
export async function createPaymentWithAllocations(
  db: Db,
  input: {
    orgId: string;
    clientId: string;
    loanId: string;
    amountCents: number;
    currency: 'NIO' | 'USD';
    method: 'cash' | 'transfer' | 'card' | 'other';
    reference: string | null;
    paidAt: string;
    notes: string | null;
    userId: string;
    allocations: AllocationWrite[];
  },
  now: number,
): Promise<string> {
  const paymentId = newId('pay');
  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [];

  statements.push({
    sql: `INSERT INTO payments (id, org_id, client_id, loan_id, amount_cents, currency, method, reference, paid_at,
            status, notes, created_by, created_at, reversed_at, reversed_by, reversal_reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, NULL, NULL, NULL)`,
    params: [
      paymentId,
      input.orgId,
      input.clientId,
      input.loanId,
      input.amountCents,
      input.currency,
      input.method,
      input.reference,
      input.paidAt,
      input.notes,
      input.userId,
      now,
    ],
  });

  for (const allocation of input.allocations) {
    statements.push({
      sql: `INSERT INTO payment_allocations (id, org_id, payment_id, installment_id, principal_cents, interest_cents,
              fee_cents, late_fee_cents, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        newId('alc'),
        input.orgId,
        paymentId,
        allocation.installmentId,
        allocation.principalCents,
        allocation.interestCents,
        allocation.feeCents,
        allocation.lateFeeCents,
        now,
      ],
    });

    statements.push(installmentApplyStatement(input.orgId, allocation, now));
  }

  statements.push({
    sql: `UPDATE loans SET status = 'settled', settled_at = ?, updated_at = ?
           WHERE org_id = ? AND id = ? AND status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM installments i
                WHERE i.loan_id = ? AND i.version = loans.schedule_version
                  AND i.status IN ('pending', 'partial', 'overdue')
             )`,
    params: [now, now, input.orgId, input.loanId, input.loanId],
  });

  await db.batch(statements);
  return paymentId;
}

function installmentApplyStatement(
  orgId: string,
  allocation: AllocationWrite,
  now: number,
): { sql: string; params: Array<string | number | null> } {
  const principal = allocation.principalCents;
  const interest = allocation.interestCents;
  const fee = allocation.feeCents;
  const lateFee = allocation.lateFeeCents;

  return {
    sql: `UPDATE installments SET
            paid_principal_cents = MIN(principal_cents, paid_principal_cents + ?),
            paid_interest_cents  = MIN(interest_cents, paid_interest_cents + ?),
            paid_fee_cents       = MIN(fee_cents, paid_fee_cents + ?),
            paid_late_fee_cents  = paid_late_fee_cents + ?,
            late_fee_accrued_cents = MAX(0, late_fee_accrued_cents - ?),
            status = CASE
              WHEN (paid_principal_cents + ?) + (paid_interest_cents + ?) + (paid_fee_cents + ?) >= total_cents THEN 'paid'
              WHEN (paid_principal_cents + ?) + (paid_interest_cents + ?) + (paid_fee_cents + ?) > 0 THEN 'partial'
              ELSE status END,
            paid_at = CASE
              WHEN (paid_principal_cents + ?) + (paid_interest_cents + ?) + (paid_fee_cents + ?) >= total_cents THEN ?
              ELSE paid_at END,
            updated_at = ?
          WHERE org_id = ? AND id = ?`,
    params: [
      principal,
      interest,
      fee,
      lateFee,
      lateFee,
      principal,
      interest,
      fee,
      principal,
      interest,
      fee,
      principal,
      interest,
      fee,
      now,
      now,
      orgId,
      allocation.installmentId,
    ],
  };
}

/**
 * Reversión auditable: no elimina el pago. Resta lo aplicado, reabre cuotas y
 * deja el registro de reversión con motivo y responsable.
 */
export async function reversePayment(
  db: Db,
  input: { orgId: string; paymentId: string; loanId: string; reason: string; userId: string },
  now: number,
): Promise<void> {
  const allocations = await listPaymentAllocations(db, input.orgId, input.paymentId);
  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [];

  statements.push({
    sql: `UPDATE payments SET status = 'reversed', reversed_at = ?, reversed_by = ?, reversal_reason = ?
           WHERE org_id = ? AND id = ? AND status = 'confirmed'`,
    params: [now, input.userId, input.reason, input.orgId, input.paymentId],
  });

  for (const allocation of allocations) {
    statements.push({
      sql: `UPDATE installments SET
              paid_principal_cents = MAX(0, paid_principal_cents - ?),
              paid_interest_cents  = MAX(0, paid_interest_cents - ?),
              paid_fee_cents       = MAX(0, paid_fee_cents - ?),
              paid_late_fee_cents  = MAX(0, paid_late_fee_cents - ?),
              status = CASE
                WHEN MAX(0, paid_principal_cents - ?) + MAX(0, paid_interest_cents - ?) + MAX(0, paid_fee_cents - ?) = 0 THEN
                  CASE WHEN due_date < ? THEN 'overdue' ELSE 'pending' END
                ELSE 'partial'
              END,
              paid_at = NULL,
              updated_at = ?
            WHERE org_id = ? AND id = ?`,
      params: [
        allocation.principal_cents,
        allocation.interest_cents,
        allocation.fee_cents,
        allocation.late_fee_cents,
        allocation.principal_cents,
        allocation.interest_cents,
        allocation.fee_cents,
        new Date(now).toISOString().slice(0, 10),
        now,
        input.orgId,
        allocation.installment_id,
      ],
    });
  }

  statements.push({
    sql: `INSERT INTO payment_reversals (id, org_id, payment_id, reason, reversed_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    params: [newId('rev'), input.orgId, input.paymentId, input.reason, input.userId, now],
  });

  statements.push({
    sql: `UPDATE loans SET status = 'active', settled_at = NULL, updated_at = ?
           WHERE org_id = ? AND id = ? AND status = 'settled'`,
    params: [now, input.orgId, input.loanId],
  });

  await db.batch(statements);
}

export async function sumPaymentsForLoan(db: Db, orgId: string, loanId: string): Promise<number> {
  return db.sum(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments
      WHERE org_id = ? AND loan_id = ? AND status = 'confirmed'`,
    [orgId, loanId],
  );
}

export async function sumPaymentsByDate(db: Db, orgId: string, from: string, to: string): Promise<number> {
  return db.sum(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments
      WHERE org_id = ? AND status = 'confirmed' AND paid_at BETWEEN ? AND ?`,
    [orgId, from, to],
  );
}
