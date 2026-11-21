import type { Db } from '../db';
import { newId } from '../lib/crypto';
import { OUTSTANDING_SQL } from './loans';

export interface CollectionAssignmentRow {
  id: string;
  org_id: string;
  client_id: string;
  loan_id: string | null;
  collector_member_id: string;
  status: 'active' | 'paused' | 'closed';
  next_contact_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface AssignmentListRow extends CollectionAssignmentRow {
  client_name: string;
  client_phone: string | null;
  loan_code: string | null;
  collector_name: string;
  overdue_cents: number;
  overdue_count: number;
  oldest_due_date: string | null;
}

export async function listAssignments(db: Db, orgId: string, today: string, collectorMemberId?: string): Promise<AssignmentListRow[]> {
  const params: Array<string | number> = [today, today, today, orgId];
  let filter = '';
  if (collectorMemberId) {
    filter = ' AND a.collector_member_id = ?';
    params.push(collectorMemberId);
  }

  return db.all<AssignmentListRow>(
    `SELECT a.id, a.org_id, a.client_id, a.loan_id, a.collector_member_id, a.status, a.next_contact_at, a.notes,
            a.created_by, a.created_at, a.updated_at,
            c.full_name AS client_name, c.phone AS client_phone, l.code AS loan_code, u.full_name AS collector_name,
            COALESCE(SUM(CASE WHEN i.status IN ('pending', 'partial', 'overdue') AND i.due_date < ?
              THEN ${OUTSTANDING_SQL} ELSE 0 END), 0) AS overdue_cents,
            COUNT(CASE WHEN i.status IN ('pending', 'partial', 'overdue') AND i.due_date < ? THEN 1 END) AS overdue_count,
            MIN(CASE WHEN i.status IN ('pending', 'partial', 'overdue') AND i.due_date < ? THEN i.due_date END) AS oldest_due_date
       FROM collection_assignments a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN loans l ON l.id = a.loan_id
       JOIN organization_members m ON m.id = a.collector_member_id
       JOIN users u ON u.id = m.user_id
       LEFT JOIN installments i ON i.loan_id = a.loan_id AND i.version = COALESCE(l.schedule_version, i.version)
      WHERE a.org_id = ? AND a.status = 'active'${filter}
      GROUP BY a.id
      ORDER BY overdue_cents DESC, a.next_contact_at ASC`,
    params,
  );
}

export async function createAssignment(
  db: Db,
  input: {
    orgId: string;
    clientId: string;
    loanId: string | null;
    collectorMemberId: string;
    nextContactAt: string | null;
    notes: string | null;
    userId: string;
  },
  now: number,
): Promise<string> {
  const id = newId('asg');
  await db.run(
    `INSERT INTO collection_assignments (id, org_id, client_id, loan_id, collector_member_id, status, next_contact_at,
       notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [id, input.orgId, input.clientId, input.loanId, input.collectorMemberId, input.nextContactAt, input.notes, input.userId, now, now],
  );
  return id;
}

export async function updateAssignment(
  db: Db,
  orgId: string,
  assignmentId: string,
  input: { status?: 'active' | 'paused' | 'closed'; nextContactAt?: string | null; notes?: string | null; collectorMemberId?: string },
  now: number,
): Promise<void> {
  const fields: string[] = [];
  const params: Array<string | number | null> = [];

  if (input.status) {
    fields.push('status = ?');
    params.push(input.status);
  }
  if (input.nextContactAt !== undefined) {
    fields.push('next_contact_at = ?');
    params.push(input.nextContactAt);
  }
  if (input.notes !== undefined) {
    fields.push('notes = ?');
    params.push(input.notes);
  }
  if (input.collectorMemberId) {
    fields.push('collector_member_id = ?');
    params.push(input.collectorMemberId);
  }
  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  params.push(now, orgId, assignmentId);
  await db.run(`UPDATE collection_assignments SET ${fields.join(', ')} WHERE org_id = ? AND id = ?`, params);
}

export interface ActivityRow {
  id: string;
  org_id: string;
  assignment_id: string | null;
  client_id: string;
  loan_id: string | null;
  type: 'call' | 'visit' | 'message' | 'promise' | 'note';
  outcome: string | null;
  notes: string | null;
  promise_amount_cents: number | null;
  promise_date: string | null;
  created_by: string | null;
  created_at: number;
}

export async function createActivity(
  db: Db,
  input: {
    orgId: string;
    assignmentId: string | null;
    clientId: string;
    loanId: string | null;
    type: string;
    outcome: string | null;
    notes: string | null;
    promiseAmountCents: number | null;
    promiseDate: string | null;
    userId: string;
  },
  now: number,
): Promise<string> {
  const id = newId('act');
  await db.run(
    `INSERT INTO collection_activities (id, org_id, assignment_id, client_id, loan_id, type, outcome, notes,
       promise_amount_cents, promise_date, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.orgId,
      input.assignmentId,
      input.clientId,
      input.loanId,
      input.type,
      input.outcome,
      input.notes,
      input.promiseAmountCents,
      input.promiseDate,
      input.userId,
      now,
    ],
  );
  return id;
}

export async function listActivities(
  db: Db,
  orgId: string,
  filters: { clientId?: string; type?: string; limit?: number } = {},
): Promise<Array<ActivityRow & { client_name: string; created_by_name: string | null }>> {
  const where: string[] = ['a.org_id = ?'];
  const params: Array<string | number> = [orgId];
  if (filters.clientId) {
    where.push('a.client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.type && ['call', 'visit', 'message', 'promise', 'note'].includes(filters.type)) {
    where.push('a.type = ?');
    params.push(filters.type);
  }

  return db.all<ActivityRow & { client_name: string; created_by_name: string | null }>(
    `SELECT a.id, a.org_id, a.assignment_id, a.client_id, a.loan_id, a.type, a.outcome, a.notes,
            a.promise_amount_cents, a.promise_date, a.created_by, a.created_at,
            c.full_name AS client_name, u.full_name AS created_by_name
       FROM collection_activities a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN users u ON u.id = a.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT ?`,
    [...params, filters.limit ?? 50],
  );
}

export interface AgendaRow {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  loan_id: string;
  loan_code: string;
  installment_id: string;
  due_date: string;
  number: number;
  outstanding_cents: number;
  currency: 'NIO' | 'USD';
  collector_name: string | null;
}

/** Agenda de cobro: cuotas vencidas o por vencer hasta `to`. */
export async function getAgenda(db: Db, orgId: string, to: string): Promise<AgendaRow[]> {
  return db.all<AgendaRow>(
    `SELECT c.id AS client_id, c.full_name AS client_name, c.phone AS client_phone,
            l.id AS loan_id, l.code AS loan_code, i.id AS installment_id, i.due_date, i.number,
            ${OUTSTANDING_SQL} AS outstanding_cents, l.currency, u.full_name AS collector_name
       FROM installments i
       JOIN loans l ON l.id = i.loan_id
       JOIN clients c ON c.id = l.client_id
       LEFT JOIN collection_assignments a ON a.client_id = c.id AND a.org_id = l.org_id AND a.status = 'active'
       LEFT JOIN organization_members m ON m.id = a.collector_member_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE i.org_id = ? AND i.version = l.schedule_version
        AND i.status IN ('pending', 'partial', 'overdue')
        AND l.status = 'active' AND l.deleted_at IS NULL
        AND i.due_date <= ?
      ORDER BY i.due_date ASC`,
    [orgId, to],
  );
}

export async function listPromises(db: Db, orgId: string, from: string, to: string) {
  return db.all<{
    id: string;
    client_id: string;
    client_name: string;
    promise_amount_cents: number;
    promise_date: string;
    notes: string | null;
    created_at: number;
  }>(
    `SELECT a.id, a.client_id, c.full_name AS client_name, a.promise_amount_cents, a.promise_date, a.notes, a.created_at
       FROM collection_activities a
       JOIN clients c ON c.id = a.client_id
      WHERE a.org_id = ? AND a.type = 'promise' AND a.promise_date BETWEEN ? AND ?
      ORDER BY a.promise_date ASC`,
    [orgId, from, to],
  );
}
