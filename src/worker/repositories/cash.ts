import type { Db } from '../db';
import { newId } from '../lib/crypto';

export interface CashRegisterRow {
  id: string;
  org_id: string;
  opened_by: string;
  opened_at: number;
  closed_by: string | null;
  closed_at: number | null;
  opening_balance_cents: number;
  expected_balance_cents: number | null;
  counted_balance_cents: number | null;
  difference_cents: number | null;
  status: 'open' | 'closed';
  notes: string | null;
}

export interface CashMovementRow {
  id: string;
  org_id: string;
  register_id: string;
  direction: 'in' | 'out';
  category: string;
  amount_cents: number;
  currency: 'NIO' | 'USD';
  source_type: string;
  source_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: number;
}

export async function getOpenRegister(db: Db, orgId: string): Promise<CashRegisterRow | null> {
  return db.first<CashRegisterRow>(
    `SELECT id, org_id, opened_by, opened_at, closed_by, closed_at, opening_balance_cents, expected_balance_cents,
            counted_balance_cents, difference_cents, status, notes
       FROM cash_registers WHERE org_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
    [orgId],
  );
}

export async function openRegister(
  db: Db,
  input: { orgId: string; userId: string; openingBalanceCents: number; notes: string | null },
  now: number,
): Promise<string> {
  const id = newId('csh');
  await db.run(
    `INSERT INTO cash_registers (id, org_id, opened_by, opened_at, closed_by, closed_at, opening_balance_cents,
       expected_balance_cents, counted_balance_cents, difference_cents, status, notes)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, 'open', ?)`,
    [id, input.orgId, input.userId, now, input.openingBalanceCents, input.notes],
  );
  return id;
}

export async function computeRegisterBalance(db: Db, orgId: string, registerId: string): Promise<number> {
  const row = await db.first<{ balance: number }>(
    `SELECT r.opening_balance_cents
       + COALESCE(SUM(CASE WHEN m.direction = 'in' THEN m.amount_cents ELSE -m.amount_cents END), 0) AS balance
       FROM cash_registers r
       LEFT JOIN cash_movements m ON m.register_id = r.id AND m.org_id = r.org_id
      WHERE r.org_id = ? AND r.id = ?
      GROUP BY r.id`,
    [orgId, registerId],
  );
  return Number(row?.balance ?? 0);
}

export async function closeRegister(
  db: Db,
  input: { orgId: string; registerId: string; userId: string; countedBalanceCents: number; notes: string | null },
  now: number,
): Promise<void> {
  const expected = await computeRegisterBalance(db, input.orgId, input.registerId);
  const difference = input.countedBalanceCents - expected;
  await db.run(
    `UPDATE cash_registers
        SET status = 'closed', closed_by = ?, closed_at = ?, expected_balance_cents = ?,
            counted_balance_cents = ?, difference_cents = ?, notes = COALESCE(?, notes)
      WHERE org_id = ? AND id = ? AND status = 'open'`,
    [input.userId, now, expected, input.countedBalanceCents, difference, input.notes, input.orgId, input.registerId],
  );
}

export async function addMovement(
  db: Db,
  input: {
    orgId: string;
    registerId: string;
    direction: 'in' | 'out';
    category: string;
    amountCents: number;
    currency: 'NIO' | 'USD';
    sourceType: 'payment' | 'loan_disbursement' | 'manual' | 'adjustment' | 'expense';
    sourceId: string | null;
    description: string | null;
    userId: string;
  },
  now: number,
): Promise<string> {
  const id = newId('mov');
  await db.run(
    `INSERT INTO cash_movements (id, org_id, register_id, direction, category, amount_cents, currency, source_type,
       source_id, description, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.orgId,
      input.registerId,
      input.direction,
      input.category,
      input.amountCents,
      input.currency,
      input.sourceType,
      input.sourceId,
      input.description,
      input.userId,
      now,
    ],
  );
  return id;
}

export interface RegisterSummaryRow extends CashRegisterRow {
  opened_by_name: string;
  closed_by_name: string | null;
  income_cents: number;
  expense_cents: number;
  balance_cents: number;
}

export async function listRegisters(db: Db, orgId: string, limit = 20): Promise<RegisterSummaryRow[]> {
  return db.all<RegisterSummaryRow>(
    `SELECT r.id, r.org_id, r.opened_by, r.opened_at, r.closed_by, r.closed_at, r.opening_balance_cents,
            r.expected_balance_cents, r.counted_balance_cents, r.difference_cents, r.status, r.notes,
            uo.full_name AS opened_by_name, uc.full_name AS closed_by_name,
            COALESCE(SUM(CASE WHEN m.direction = 'in' THEN m.amount_cents ELSE 0 END), 0) AS income_cents,
            COALESCE(SUM(CASE WHEN m.direction = 'out' THEN m.amount_cents ELSE 0 END), 0) AS expense_cents,
            r.opening_balance_cents
              + COALESCE(SUM(CASE WHEN m.direction = 'in' THEN m.amount_cents ELSE -m.amount_cents END), 0) AS balance_cents
       FROM cash_registers r
       JOIN users uo ON uo.id = r.opened_by
       LEFT JOIN users uc ON uc.id = r.closed_by
       LEFT JOIN cash_movements m ON m.register_id = r.id
      WHERE r.org_id = ?
      GROUP BY r.id
      ORDER BY r.opened_at DESC
      LIMIT ?`,
    [orgId, limit],
  );
}

export async function listMovements(db: Db, orgId: string, registerId: string, limit = 200): Promise<Array<CashMovementRow & { created_by_name: string | null }>> {
  return db.all<CashMovementRow & { created_by_name: string | null }>(
    `SELECT m.id, m.org_id, m.register_id, m.direction, m.category, m.amount_cents, m.currency, m.source_type,
            m.source_id, m.description, m.created_by, m.created_at, u.full_name AS created_by_name
       FROM cash_movements m
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.org_id = ? AND m.register_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?`,
    [orgId, registerId, limit],
  );
}

export async function getRegister(db: Db, orgId: string, registerId: string): Promise<CashRegisterRow | null> {
  return db.first<CashRegisterRow>(
    `SELECT id, org_id, opened_by, opened_at, closed_by, closed_at, opening_balance_cents, expected_balance_cents,
            counted_balance_cents, difference_cents, status, notes
       FROM cash_registers WHERE org_id = ? AND id = ?`,
    [orgId, registerId],
  );
}
