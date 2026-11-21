import type { Db } from '../db';
import { newId } from '../lib/crypto';
import { nextSequence } from './sequences';
import type { ClientReference } from '../../shared/types';

export interface ClientRow {
  id: string;
  org_id: string;
  code: string;
  full_name: string;
  identification: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  references_json: string;
  notes: string | null;
  status: 'active' | 'inactive' | 'blocked';
  created_by: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ClientListFilters {
  search?: string;
  status?: string;
  page: number;
  pageSize: number;
  sort?: string;
  direction: 'asc' | 'desc';
}

const SORTABLE: Record<string, string> = {
  name: 'c.full_name',
  code: 'c.code',
  createdAt: 'c.created_at',
  status: 'c.status',
};

export async function listClients(
  db: Db,
  orgId: string,
  filters: ClientListFilters,
): Promise<{ items: ClientRow[]; total: number }> {
  const where: string[] = ['c.org_id = ?', 'c.deleted_at IS NULL'];
  const params: Array<string | number> = [orgId];

  if (filters.status && ['active', 'inactive', 'blocked'].includes(filters.status)) {
    where.push('c.status = ?');
    params.push(filters.status);
  }
  if (filters.search) {
    where.push(`(c.full_name LIKE ? OR c.code LIKE ? OR c.identification LIKE ? OR c.phone LIKE ?)`);
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }

  const orderColumn = SORTABLE[filters.sort ?? ''] ?? 'c.created_at';
  const direction = filters.direction === 'asc' ? 'ASC' : 'DESC';
  const whereSql = where.join(' AND ');

  const total = await db.count(`SELECT COUNT(*) AS total FROM clients c WHERE ${whereSql}`, params);
  const items = await db.all<ClientRow>(
    `SELECT c.id, c.org_id, c.code, c.full_name, c.identification, c.phone, c.email, c.address,
            c.references_json, c.notes, c.status, c.created_by, c.created_at, c.updated_at, c.deleted_at
       FROM clients c
      WHERE ${whereSql}
      ORDER BY ${orderColumn} ${direction}
      LIMIT ? OFFSET ?`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { items, total };
}

export async function getClient(db: Db, orgId: string, clientId: string): Promise<ClientRow | null> {
  return db.first<ClientRow>(
    `SELECT id, org_id, code, full_name, identification, phone, email, address, references_json, notes,
            status, created_by, created_at, updated_at, deleted_at
       FROM clients WHERE org_id = ? AND id = ? AND deleted_at IS NULL`,
    [orgId, clientId],
  );
}

export interface CreateClientInput {
  fullName: string;
  identification: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  references: ClientReference[];
  notes: string | null;
  status: 'active' | 'inactive' | 'blocked';
}

export async function createClient(db: Db, orgId: string, input: CreateClientInput, userId: string, now: number): Promise<string> {
  const id = newId('cli');
  const code = await nextSequence(db, orgId, 'client', 'CLI');
  await db.run(
    `INSERT INTO clients (id, org_id, code, full_name, identification, phone, email, address, references_json,
                          notes, status, created_by, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      orgId,
      code,
      input.fullName,
      input.identification,
      input.phone,
      input.email,
      input.address,
      JSON.stringify(input.references ?? []),
      input.notes,
      input.status,
      userId,
      now,
      now,
    ],
  );
  return id;
}

export async function updateClient(
  db: Db,
  orgId: string,
  clientId: string,
  input: Partial<CreateClientInput>,
  now: number,
): Promise<void> {
  const fields: string[] = [];
  const params: Array<string | number | null> = [];

  const map: Array<[keyof CreateClientInput, string]> = [
    ['fullName', 'full_name'],
    ['identification', 'identification'],
    ['phone', 'phone'],
    ['email', 'email'],
    ['address', 'address'],
    ['notes', 'notes'],
    ['status', 'status'],
  ];

  for (const [key, column] of map) {
    const value = input[key];
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      params.push(value as string | null);
    }
  }
  if (input.references !== undefined) {
    fields.push('references_json = ?');
    params.push(JSON.stringify(input.references));
  }
  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  params.push(now, orgId, clientId);
  await db.run(`UPDATE clients SET ${fields.join(', ')} WHERE org_id = ? AND id = ? AND deleted_at IS NULL`, params);
}

export async function softDeleteClient(db: Db, orgId: string, clientId: string, now: number): Promise<void> {
  await db.run(`UPDATE clients SET deleted_at = ?, updated_at = ? WHERE org_id = ? AND id = ?`, [now, now, orgId, clientId]);
}

export interface ClientStatsRow {
  activeLoans: number;
  outstandingCents: number;
  overdueCents: number;
  totalPaidCents: number;
  lastPaymentAt: string | null;
}

export async function getClientStats(db: Db, orgId: string, clientId: string, today: string): Promise<ClientStatsRow> {
  const loans = await db.first<{ activeLoans: number; outstandingCents: number; overdueCents: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN l.status = 'active' THEN 1 ELSE 0 END), 0) AS activeLoans,
       COALESCE(SUM(CASE WHEN l.status = 'active' THEN
         i.principal_cents + i.interest_cents + i.fee_cents - i.paid_principal_cents - i.paid_interest_cents - i.paid_fee_cents
       ELSE 0 END), 0) AS outstandingCents,
       COALESCE(SUM(CASE WHEN l.status = 'active' AND i.due_date < ? AND i.status IN ('pending', 'partial', 'overdue') THEN
         i.principal_cents + i.interest_cents + i.fee_cents - i.paid_principal_cents - i.paid_interest_cents - i.paid_fee_cents
       ELSE 0 END), 0) AS overdueCents
     FROM loans l
     LEFT JOIN installments i ON i.loan_id = l.id AND i.version = l.schedule_version
     WHERE l.org_id = ? AND l.client_id = ? AND l.deleted_at IS NULL AND l.status <> 'cancelled'`,
    [today, orgId, clientId],
  );

  const payments = await db.first<{ totalPaidCents: number; lastPaymentAt: string | null }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS totalPaidCents, MAX(paid_at) AS lastPaymentAt
       FROM payments WHERE org_id = ? AND client_id = ? AND status = 'confirmed'`,
    [orgId, clientId],
  );

  return {
    activeLoans: Number(loans?.activeLoans ?? 0),
    outstandingCents: Number(loans?.outstandingCents ?? 0),
    overdueCents: Number(loans?.overdueCents ?? 0),
    totalPaidCents: Number(payments?.totalPaidCents ?? 0),
    lastPaymentAt: payments?.lastPaymentAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------
export interface ClientDocumentRow {
  id: string;
  org_id: string;
  client_id: string;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: number;
}

export async function createClientDocument(
  db: Db,
  input: { orgId: string; clientId: string; r2Key: string; filename: string; contentType: string; sizeBytes: number; uploadedBy: string },
  now: number,
): Promise<string> {
  const id = newId('doc');
  await db.run(
    `INSERT INTO client_documents (id, org_id, client_id, r2_key, filename, content_type, size_bytes, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.orgId, input.clientId, input.r2Key, input.filename, input.contentType, input.sizeBytes, input.uploadedBy, now],
  );
  return id;
}

export async function listClientDocuments(db: Db, orgId: string, clientId: string): Promise<ClientDocumentRow[]> {
  return db.all<ClientDocumentRow>(
    `SELECT id, org_id, client_id, r2_key, filename, content_type, size_bytes, uploaded_by, created_at
       FROM client_documents WHERE org_id = ? AND client_id = ? ORDER BY created_at DESC`,
    [orgId, clientId],
  );
}

export async function getClientDocument(db: Db, orgId: string, documentId: string): Promise<ClientDocumentRow | null> {
  return db.first<ClientDocumentRow>(
    `SELECT id, org_id, client_id, r2_key, filename, content_type, size_bytes, uploaded_by, created_at
       FROM client_documents WHERE org_id = ? AND id = ?`,
    [orgId, documentId],
  );
}

export async function deleteClientDocument(db: Db, orgId: string, documentId: string): Promise<void> {
  await db.run(`DELETE FROM client_documents WHERE org_id = ? AND id = ?`, [orgId, documentId]);
}

export async function countClients(db: Db, orgId: string): Promise<number> {
  return db.count(`SELECT COUNT(*) AS total FROM clients WHERE org_id = ? AND deleted_at IS NULL`, [orgId]);
}

export async function sumClientStorageBytes(db: Db, orgId: string): Promise<number> {
  return db.sum(`SELECT COALESCE(SUM(size_bytes), 0) AS total FROM client_documents WHERE org_id = ?`, [orgId]);
}
