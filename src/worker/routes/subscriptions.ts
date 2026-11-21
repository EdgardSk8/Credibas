import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { parseBody } from '../middleware/core';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { changePlanSchema } from '../../shared/validation';
import {
  cancelSubscription,
  changeSubscriptionPlan,
  getPlanByKey,
  getPlanLimits,
  getSubscription,
  listBillingPayments,
  listInvoices,
  recordSubscriptionEvent,
  resumeSubscription,
} from '../repositories/subscriptions';
import { getLimitState } from '../services/limits';
import { writeAudit } from '../repositories/audit';
import { mapSubscription } from './mappers';
import { toIso } from '../lib/crypto';
import type { AppEnv } from '../types';

export const subscriptionRoutes = new Hono<AppEnv>();

subscriptionRoutes.use('*', requireAuth, requireOrg);

subscriptionRoutes.get('/current', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;

  const subscription = await getSubscription(db, orgId);
  if (!subscription) throw AppError.notFound('Tu negocio no tiene una suscripción');

  const limits = await getPlanLimits(db, subscription.plan.id);
  const state = await getLimitState(db, orgId);

  return c.json({ subscription: mapSubscription(subscription, limits, state.usage) });
});

subscriptionRoutes.get('/invoices', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const invoices = await listInvoices(db, c.get('orgId') as string);

  return c.json({
    items: invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      amountCents: invoice.amount_cents,
      currency: invoice.currency,
      status: invoice.status,
      issuedAt: new Date(invoice.issued_at).toISOString(),
      dueAt: new Date(invoice.due_at).toISOString(),
      paidAt: toIso(invoice.paid_at),
      notes: invoice.notes,
    })),
  });
});

subscriptionRoutes.get('/billing-payments', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const payments = await listBillingPayments(db, c.get('orgId') as string);

  return c.json({
    items: payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      reference: payment.provider_ref,
      amountCents: payment.amount_cents,
      currency: payment.currency,
      status: payment.status,
      createdAt: new Date(payment.created_at).toISOString(),
      confirmedAt: toIso(payment.confirmed_at),
    })),
  });
});

subscriptionRoutes.post('/change-plan', requirePermission(PERMISSIONS.billingManage), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const input = await parseBody(c, changePlanSchema);
  const now = Date.now();

  const plan = await getPlanByKey(db, input.planKey);
  if (!plan || plan.is_active !== 1) throw AppError.badRequest('Ese plan no está disponible');

  const current = await getSubscription(db, orgId);
  if (!current) throw AppError.notFound('Suscripción no encontrada');

  // Los planes de pago se activan cuando el pago se confirma en el backend.
  const isPaidPlan = plan.price_monthly_cents > 0 && plan.price_yearly_cents > 0;
  const status = isPaidPlan ? (current.status === 'trialing' ? 'trialing' : current.status) : current.status;

  await changeSubscriptionPlan(db, { orgId, planId: plan.id, billingCycle: input.billingCycle, status }, now);
  await recordSubscriptionEvent(
    db,
    { orgId, subscriptionId: current.id, type: 'plan_changed', data: { from: current.plan.key, to: plan.key, billingCycle: input.billingCycle }, actorUserId: c.get('userId') },
    now,
  );

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'subscription.plan_changed', entityType: 'subscription', entityId: current.id, before: { plan: current.plan.key }, after: { plan: plan.key } },
    now,
  );

  return c.json({
    ok: true,
    message: isPaidPlan
      ? 'Plan actualizado. La activación definitiva ocurre cuando se confirme el pago.'
      : 'Plan actualizado.',
  });
});

subscriptionRoutes.post('/cancel', requirePermission(PERMISSIONS.billingManage), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const now = Date.now();
  const subscription = await getSubscription(db, orgId);
  if (!subscription) throw AppError.notFound('Suscripción no encontrada');

  await cancelSubscription(db, orgId, false, now);
  await recordSubscriptionEvent(db, { orgId, subscriptionId: subscription.id, type: 'canceled', data: {}, actorUserId: c.get('userId') }, now);

  return c.json({ ok: true, message: 'Tu suscripción no se renovará al final del período actual.' });
});

subscriptionRoutes.post('/resume', requirePermission(PERMISSIONS.billingManage), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const now = Date.now();
  const subscription = await getSubscription(db, orgId);
  if (!subscription) throw AppError.notFound('Suscripción no encontrada');

  await resumeSubscription(db, orgId, now);
  await recordSubscriptionEvent(db, { orgId, subscriptionId: subscription.id, type: 'resumed', data: {}, actorUserId: c.get('userId') }, now);

  return c.json({ ok: true, message: 'Tu suscripción se renovará normalmente.' });
});
