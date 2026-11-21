import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { newId } from '../lib/crypto';
import { paginated, parseBody, parseQuery } from '../middleware/core';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { clientInputSchema, paginationSchema } from '../../shared/validation';
import { assertCanAdd, assertSubscriptionWritable, getLimitState } from '../services/limits';
import {
  countClients,
  createClient,
  createClientDocument,
  deleteClientDocument,
  getClient,
  getClientDocument,
  getClientStats,
  listClientDocuments,
  listClients,
  softDeleteClient,
  updateClient,
} from '../repositories/clients';
import { listLoansByClient } from '../repositories/loans';
import { getSubscription } from '../repositories/subscriptions';
import { writeAudit } from '../repositories/audit';
import { mapClient, mapLoan, toCsv } from './mappers';
import { todayInTimezone } from '../../shared/finance/dates';
import { formatMoney } from '../../shared/finance/money';
import type { AppEnv } from '../types';

export const clientRoutes = new Hono<AppEnv>();

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

clientRoutes.use('*', requireAuth, requireOrg);

clientRoutes.get('/', requirePermission(PERMISSIONS.clientsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const query = parseQuery(c, paginationSchema);
  const orgId = c.get('orgId') as string;
  const today = todayInTimezone(c.get('orgTimezone'));

  const { items, total } = await listClients(db, orgId, {
    search: query.search,
    status: query.status,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    direction: query.direction,
  });

  const enriched = await Promise.all(
    items.map(async (row) => ({
      ...mapClient(row),
      stats: await getClientStats(db, orgId, row.id, today),
    })),
  );

  return c.json(paginated(enriched, query.page, query.pageSize, total));
});

clientRoutes.post('/', requirePermission(PERMISSIONS.clientsWrite), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const input = await parseBody(c, clientInputSchema);
  const now = Date.now();

  const subscription = await getSubscription(db, orgId);
  assertSubscriptionWritable(subscription?.status ?? 'expired');
  await assertCanAdd(db, orgId, 'clients');

  const existing = input.identification
    ? await db.first<{ id: string }>(`SELECT id FROM clients WHERE org_id = ? AND identification = ? AND deleted_at IS NULL`, [
        orgId,
        input.identification,
      ])
    : null;
  if (existing) throw AppError.conflict('Ya existe un cliente con esa identificación');

  const clientId = await createClient(db, orgId, input, c.get('userId') as string, now);

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId'),
      action: 'client.created',
      entityType: 'client',
      entityId: clientId,
      after: { fullName: input.fullName, identification: input.identification },
      ip: c.get('clientIp'),
      userAgent: c.req.header('user-agent') ?? null,
    },
    now,
  );

  return c.json({ ok: true, clientId }, 201);
});

clientRoutes.get('/export.csv', requirePermission(PERMISSIONS.reportsExport), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const today = todayInTimezone(c.get('orgTimezone'));

  const { items } = await listClients(db, orgId, {
    page: 1,
    pageSize: 10_000,
    direction: 'asc',
    sort: 'name',
  });

  const rows: Array<Array<string | number | null>> = [];
  for (const row of items) {
    const stats = await getClientStats(db, orgId, row.id, today);
    rows.push([
      row.code,
      row.full_name,
      row.identification,
      row.phone,
      row.email,
      row.status,
      stats.activeLoans,
      formatMoney(stats.outstandingCents),
      formatMoney(stats.overdueCents),
    ]);
  }

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'client.exported', entityType: 'client', entityId: null, ip: c.get('clientIp') },
    Date.now(),
  );

  const csv = toCsv(
    ['Código', 'Nombre', 'Identificación', 'Teléfono', 'Correo', 'Estado', 'Préstamos activos', 'Saldo pendiente', 'Saldo vencido'],
    rows,
  );

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="clientes-${today}.csv"`,
    },
  });
});

clientRoutes.get('/:id', requirePermission(PERMISSIONS.clientsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const today = todayInTimezone(c.get('orgTimezone'));

  const client = await getClient(db, orgId, c.req.param('id'));
  if (!client) throw AppError.notFound('Cliente no encontrado');

  const stats = await getClientStats(db, orgId, client.id, today);
  const loans = await listLoansByClient(db, orgId, client.id, today);

  return c.json({
    client: { ...mapClient(client), stats },
    loans: loans.map(mapLoan),
  });
});

clientRoutes.patch('/:id', requirePermission(PERMISSIONS.clientsWrite), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const clientId = c.req.param('id');
  const input = await parseBody(c, clientInputSchema.partial());
  const now = Date.now();

  const client = await getClient(db, orgId, clientId);
  if (!client) throw AppError.notFound('Cliente no encontrado');

  if (input.identification) {
    const duplicate = await db.first<{ id: string }>(
      `SELECT id FROM clients WHERE org_id = ? AND identification = ? AND id <> ? AND deleted_at IS NULL`,
      [orgId, input.identification, clientId],
    );
    if (duplicate) throw AppError.conflict('Ya existe otro cliente con esa identificación');
  }

  await updateClient(db, orgId, clientId, input, now);

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId'),
      action: 'client.updated',
      entityType: 'client',
      entityId: clientId,
      before: { fullName: client.full_name, status: client.status },
      after: input,
      ip: c.get('clientIp'),
      userAgent: c.req.header('user-agent') ?? null,
    },
    now,
  );

  return c.json({ ok: true });
});

clientRoutes.delete('/:id', requirePermission(PERMISSIONS.clientsDelete), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const clientId = c.req.param('id');

  const client = await getClient(db, orgId, clientId);
  if (!client) throw AppError.notFound('Cliente no encontrado');

  const activeLoans = await db.count(
    `SELECT COUNT(*) AS total FROM loans WHERE org_id = ? AND client_id = ? AND status = 'active' AND deleted_at IS NULL`,
    [orgId, clientId],
  );
  if (activeLoans > 0) {
    throw AppError.conflict('El cliente tiene préstamos activos. Liquídalos o cancélalos antes de eliminarlo.');
  }

  await softDeleteClient(db, orgId, clientId, Date.now());
  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'client.deleted', entityType: 'client', entityId: clientId, ip: c.get('clientIp') },
    Date.now(),
  );

  return c.json({ ok: true });
});

clientRoutes.get('/:id/documents', requirePermission(PERMISSIONS.clientsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const documents = await listClientDocuments(db, orgId, c.req.param('id'));

  return c.json({
    items: documents.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      contentType: doc.content_type,
      sizeBytes: doc.size_bytes,
      createdAt: new Date(doc.created_at).toISOString(),
      downloadUrl: `/api/clients/documents/${doc.id}`,
    })),
  });
});

clientRoutes.post('/:id/documents', requirePermission(PERMISSIONS.clientsDocuments), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const clientId = c.req.param('id');

  const client = await getClient(db, orgId, clientId);
  if (!client) throw AppError.notFound('Cliente no encontrado');

  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw AppError.badRequest('Adjunta un archivo válido');
  if (file.size === 0) throw AppError.badRequest('El archivo está vacío');
  if (file.size > MAX_FILE_BYTES) throw AppError.badRequest('El archivo supera el máximo de 10 MB');
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    throw AppError.badRequest('Formato no permitido. Usa PDF, JPG, PNG, WEBP o DOCX.');
  }

  const limits = await getLimitState(db, orgId);
  const storageLimit = limits.limits.storage_mb;
  if (storageLimit !== undefined && storageLimit >= 0) {
    const usedMb = limits.usage.storage_mb ?? 0;
    const incomingMb = Math.ceil(file.size / (1024 * 1024));
    if (usedMb + incomingMb > storageLimit) {
      throw AppError.limitExceeded(`Tu plan permite ${storageLimit} MB de almacenamiento.`, { metric: 'storage_mb', limit: storageLimit });
    }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const key = `org/${orgId}/clients/${clientId}/${newId('file')}-${safeName}`;
  await c.env.FILES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { orgId, clientId, originalName: safeName },
  });

  const documentId = await createClientDocument(
    db,
    {
      orgId,
      clientId,
      r2Key: key,
      filename: safeName,
      contentType: file.type,
      sizeBytes: file.size,
      uploadedBy: c.get('userId') as string,
    },
    Date.now(),
  );

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'client.document_uploaded', entityType: 'client_document', entityId: documentId, after: { clientId, filename: safeName } },
    Date.now(),
  );

  return c.json({ ok: true, documentId }, 201);
});

clientRoutes.get('/documents/:documentId', requirePermission(PERMISSIONS.clientsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;

  const document = await getClientDocument(db, orgId, c.req.param('documentId'));
  if (!document) throw AppError.notFound('Documento no encontrado');

  const object = await c.env.FILES.get(document.r2_key);
  if (!object) throw AppError.notFound('El archivo ya no está disponible');

  return new Response(object.body, {
    headers: {
      'content-type': document.content_type,
      'content-disposition': `attachment; filename="${document.filename}"`,
      'cache-control': 'private, max-age=0, must-revalidate',
    },
  });
});

clientRoutes.delete('/documents/:documentId', requirePermission(PERMISSIONS.clientsDocuments), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;

  const document = await getClientDocument(db, orgId, c.req.param('documentId'));
  if (!document) throw AppError.notFound('Documento no encontrado');

  await c.env.FILES.delete(document.r2_key);
  await deleteClientDocument(db, orgId, document.id);

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'client.document_deleted', entityType: 'client_document', entityId: document.id },
    Date.now(),
  );

  return c.json({ ok: true });
});

clientRoutes.get('/meta/limits', requirePermission(PERMISSIONS.clientsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const total = await countClients(db, orgId);
  const limits = await getLimitState(db, orgId);
  return c.json({ clients: total, limits });
});
