import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { parseBody } from '../middleware/core';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { cashMovementSchema, closeCashRegisterSchema, openCashRegisterSchema } from '../../shared/validation';
import {
  addMovement,
  closeRegister,
  computeRegisterBalance,
  getOpenRegister,
  getRegister,
  listMovements,
  listRegisters,
  openRegister,
} from '../repositories/cash';
import { assertSubscriptionWritable } from '../services/limits';
import { getSubscription } from '../repositories/subscriptions';
import { writeAudit } from '../repositories/audit';
import { mapMovement, mapRegister } from './mappers';
import type { AppEnv } from '../types';

export const cashRoutes = new Hono<AppEnv>();

cashRoutes.use('*', requireAuth, requireOrg);

cashRoutes.get('/registers', requirePermission(PERMISSIONS.cashRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const registers = await listRegisters(db, c.get('orgId') as string);
  return c.json({ items: registers.map(mapRegister) });
});

cashRoutes.get('/registers/current', requirePermission(PERMISSIONS.cashRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const register = await getOpenRegister(db, orgId);
  if (!register) return c.json({ register: null });

  const registers = await listRegisters(db, orgId, 50);
  const summary = registers.find((item) => item.id === register.id);
  return c.json({ register: summary ? mapRegister(summary) : null });
});

cashRoutes.post('/registers/open', requirePermission(PERMISSIONS.cashClose), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const input = await parseBody(c, openCashRegisterSchema);

  const subscription = await getSubscription(db, orgId);
  assertSubscriptionWritable(subscription?.status ?? 'expired');

  const existing = await getOpenRegister(db, orgId);
  if (existing) throw AppError.conflict('Ya existe una caja abierta. Ciérrala antes de abrir otra.');

  const registerId = await openRegister(
    db,
    {
      orgId,
      userId: c.get('userId') as string,
      openingBalanceCents: input.openingBalanceCents,
      notes: input.notes,
    },
    Date.now(),
  );

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'cash.register_opened', entityType: 'cash_register', entityId: registerId, after: { openingBalanceCents: input.openingBalanceCents } },
    Date.now(),
  );

  return c.json({ ok: true, registerId }, 201);
});

cashRoutes.post('/registers/:id/close', requirePermission(PERMISSIONS.cashClose), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const input = await parseBody(c, closeCashRegisterSchema);
  const registerId = c.req.param('id');

  const register = await getRegister(db, orgId, registerId);
  if (!register) throw AppError.notFound('Caja no encontrada');
  if (register.status === 'closed') throw AppError.conflict('Esta caja ya está cerrada');

  const expected = await computeRegisterBalance(db, orgId, registerId);
  await closeRegister(
    db,
    {
      orgId,
      registerId,
      userId: c.get('userId') as string,
      countedBalanceCents: input.countedBalanceCents,
      notes: input.notes,
    },
    Date.now(),
  );

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId'),
      action: 'cash.register_closed',
      entityType: 'cash_register',
      entityId: registerId,
      before: { expectedBalanceCents: expected },
      after: { countedBalanceCents: input.countedBalanceCents, differenceCents: input.countedBalanceCents - expected },
    },
    Date.now(),
  );

  return c.json({ ok: true, expectedBalanceCents: expected, differenceCents: input.countedBalanceCents - expected });
});

cashRoutes.get('/registers/:id/movements', requirePermission(PERMISSIONS.cashRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const movements = await listMovements(db, c.get('orgId') as string, c.req.param('id'));
  return c.json({ items: movements.map(mapMovement) });
});

cashRoutes.post('/registers/:id/movements', requirePermission(PERMISSIONS.cashWrite), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const registerId = c.req.param('id');
  const input = await parseBody(c, cashMovementSchema);

  const register = await getRegister(db, orgId, registerId);
  if (!register) throw AppError.notFound('Caja no encontrada');
  if (register.status !== 'open') throw AppError.conflict('La caja está cerrada');

  const movementId = await addMovement(
    db,
    {
      orgId,
      registerId,
      direction: input.direction,
      category: input.category,
      amountCents: input.amountCents,
      currency: c.get('orgCurrency') ?? 'NIO',
      sourceType: 'manual',
      sourceId: null,
      description: input.description,
      userId: c.get('userId') as string,
    },
    Date.now(),
  );

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'cash.movement_created', entityType: 'cash_movement', entityId: movementId, after: input },
    Date.now(),
  );

  return c.json({ ok: true, movementId }, 201);
});
