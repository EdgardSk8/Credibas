import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { parseBody } from '../middleware/core';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { collectionActivitySchema, collectionAssignmentSchema } from '../../shared/validation';
import { addDays, todayInTimezone } from '../../shared/finance/dates';
import {
  createActivity,
  createAssignment,
  getAgenda,
  listActivities,
  listAssignments,
  listPromises,
  updateAssignment,
} from '../repositories/collections';
import { getClient } from '../repositories/clients';
import { getLoan } from '../repositories/loans';
import { findMemberById } from '../repositories/members';
import { writeAudit } from '../repositories/audit';
import type { AppEnv } from '../types';

export const collectionRoutes = new Hono<AppEnv>();

collectionRoutes.use('*', requireAuth, requireOrg);

collectionRoutes.get('/assignments', requirePermission(PERMISSIONS.collectionsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const today = todayInTimezone(c.get('orgTimezone'));
  const collectorMemberId = new URL(c.req.url).searchParams.get('collectorId') ?? undefined;

  const items = await listAssignments(db, orgId, today, collectorMemberId);
  return c.json({
    items: items.map((item) => ({
      id: item.id,
      clientId: item.client_id,
      clientName: item.client_name,
      clientPhone: item.client_phone,
      loanId: item.loan_id,
      loanCode: item.loan_code,
      collectorMemberId: item.collector_member_id,
      collectorName: item.collector_name,
      status: item.status,
      nextContactAt: item.next_contact_at,
      overdueCents: Number(item.overdue_cents ?? 0),
      overdueCount: Number(item.overdue_count ?? 0),
      oldestDueDate: item.oldest_due_date,
    })),
  });
});

collectionRoutes.post('/assignments', requirePermission(PERMISSIONS.collectionsWrite), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const input = await parseBody(c, collectionAssignmentSchema);

  const client = await getClient(db, orgId, input.clientId);
  if (!client) throw AppError.notFound('Cliente no encontrado');

  if (input.loanId) {
    const loan = await getLoan(db, orgId, input.loanId, todayInTimezone(c.get('orgTimezone')));
    if (!loan) throw AppError.notFound('Préstamo no encontrado');
  }

  const collector = await findMemberById(db, orgId, input.collectorMemberId);
  if (!collector) throw AppError.notFound('Cobrador no encontrado');

  const assignmentId = await createAssignment(
    db,
    {
      orgId,
      clientId: input.clientId,
      loanId: input.loanId ?? null,
      collectorMemberId: input.collectorMemberId,
      nextContactAt: input.nextContactAt ?? null,
      notes: input.notes,
      userId: c.get('userId') as string,
    },
    Date.now(),
  );

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'collection.assignment_created', entityType: 'collection_assignment', entityId: assignmentId },
    Date.now(),
  );

  return c.json({ ok: true, assignmentId }, 201);
});

collectionRoutes.patch('/assignments/:id', requirePermission(PERMISSIONS.collectionsWrite), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const body = await c.req.json<{ status?: 'active' | 'paused' | 'closed'; nextContactAt?: string | null; notes?: string | null; collectorMemberId?: string }>();

  await updateAssignment(db, orgId, c.req.param('id'), body, Date.now());
  return c.json({ ok: true });
});

collectionRoutes.get('/activities', requirePermission(PERMISSIONS.collectionsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const url = new URL(c.req.url);
  const items = await listActivities(db, c.get('orgId') as string, {
    clientId: url.searchParams.get('clientId') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
    limit: Math.min(200, Number(url.searchParams.get('limit') ?? 50)),
  });

  return c.json({
    items: items.map((item) => ({
      id: item.id,
      clientId: item.client_id,
      clientName: item.client_name,
      loanId: item.loan_id,
      type: item.type,
      outcome: item.outcome,
      notes: item.notes,
      promiseAmountCents: item.promise_amount_cents,
      promiseDate: item.promise_date,
      createdAt: new Date(item.created_at).toISOString(),
      createdByName: item.created_by_name,
    })),
  });
});

collectionRoutes.post('/activities', requirePermission(PERMISSIONS.collectionsWrite), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const input = await parseBody(c, collectionActivitySchema);

  const client = await getClient(db, orgId, input.clientId);
  if (!client) throw AppError.notFound('Cliente no encontrado');

  const activityId = await createActivity(
    db,
    {
      orgId,
      assignmentId: input.assignmentId ?? null,
      clientId: input.clientId,
      loanId: input.loanId ?? null,
      type: input.type,
      outcome: input.outcome,
      notes: input.notes,
      promiseAmountCents: input.promiseAmountCents ?? null,
      promiseDate: input.promiseDate ?? null,
      userId: c.get('userId') as string,
    },
    Date.now(),
  );

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'collection.activity_created', entityType: 'collection_activity', entityId: activityId, after: { type: input.type, clientId: input.clientId } },
    Date.now(),
  );

  return c.json({ ok: true, activityId }, 201);
});

collectionRoutes.get('/agenda', requirePermission(PERMISSIONS.collectionsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const today = todayInTimezone(c.get('orgTimezone'));
  const days = Math.min(90, Math.max(1, Number(new URL(c.req.url).searchParams.get('days') ?? 7)));

  const items = await getAgenda(db, orgId, addDays(today, days));
  return c.json({
    today,
    items: items.map((item) => ({
      clientId: item.client_id,
      clientName: item.client_name,
      clientPhone: item.client_phone,
      loanId: item.loan_id,
      loanCode: item.loan_code,
      installmentId: item.installment_id,
      dueDate: item.due_date,
      number: item.number,
      outstandingCents: Number(item.outstanding_cents ?? 0),
      currency: item.currency,
      collectorName: item.collector_name,
      overdue: item.due_date < today,
    })),
  });
});

collectionRoutes.get('/promises', requirePermission(PERMISSIONS.collectionsRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const today = todayInTimezone(c.get('orgTimezone'));
  const items = await listPromises(db, c.get('orgId') as string, today, addDays(today, 30));

  return c.json({
    items: items.map((item) => ({
      id: item.id,
      clientId: item.client_id,
      clientName: item.client_name,
      promiseAmountCents: item.promise_amount_cents,
      promiseDate: item.promise_date,
      notes: item.notes,
      createdAt: new Date(item.created_at).toISOString(),
    })),
  });
});
