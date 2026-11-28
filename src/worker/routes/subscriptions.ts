import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { parseBody } from '../middleware/core';
import { requireAuth, requireOrg, requirePermission } from '../middleware/guards';
import { PERMISSIONS } from '../../shared/rbac';
import { subscriptionQuoteSchema, subscriptionRequestSchema } from '../../shared/validation';
import {
  cancelSubscription,
  createSubscriptionRequest,
  getPendingSubscriptionRequest,
  getPlanByKey,
  getPlanLimits,
  getSubscription,
  hasUsedFreePlan,
  listActivePlans,
  listBillingPayments,
  listInvoices,
  recordSubscriptionEvent,
  resumeSubscription,
  startFreeSubscription,
  type SubscriptionRequestView,
} from '../repositories/subscriptions';
import { getLimitState } from '../services/limits';
import { loadPlanCatalog } from '../services/pricing';
import { quoteSubscriptionAmount } from '../services/billing-cycle';
import { describePaymentProvider } from '../services/payments';
import {
  getActivePaymentMethod,
  listPaymentMethods,
  revokePaymentMethod,
  toPublicPaymentMethod,
} from '../repositories/payment-methods';
import { PricingError, quoteSubscription } from '../../shared/billing/pricing';
import { listAddons, listModules } from '../repositories/catalog';
import { writeAudit } from '../repositories/audit';
import { mapPlan, mapSubscription } from './mappers';
import { toIso } from '../lib/crypto';
import type { AppEnv } from '../types';

function parseFeatures(value: string): string[] {
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

function mapSubscriptionRequest(row: SubscriptionRequestView) {
  return {
    id: row.id,
    orgName: row.org_name,
    planKey: row.plan_key,
    planName: row.plan_name,
    billingCycle: row.billing_cycle,
    status: row.status,
    note: row.note,
    adminNote: row.admin_note,
    requestedBy: row.requester_email,
    createdAt: new Date(row.created_at).toISOString(),
    resolvedAt: toIso(row.resolved_at),
  };
}

export const subscriptionRoutes = new Hono<AppEnv>();

subscriptionRoutes.use('*', requireAuth, requireOrg);

subscriptionRoutes.get('/current', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;

  const subscription = await getSubscription(db, orgId);
  if (!subscription) throw AppError.notFound('Tu negocio no tiene una suscripción');

  const state = await getLimitState(db, orgId);

  return c.json({
    subscription: {
      ...mapSubscription(subscription, state.limits, state.usage),
      freePlanUsed: await hasUsedFreePlan(db, orgId),
    },
  });
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

subscriptionRoutes.get('/upcoming', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;

  const subscription = await getSubscription(db, orgId);
  if (!subscription) throw AppError.notFound('Tu negocio no tiene una suscripción');

  const now = Date.now();
  const amount = await quoteSubscriptionAmount(
    db,
    {
      subscriptionId: subscription.id,
      planKey: subscription.plan.key,
      billingCycle: subscription.billing_cycle,
      currency: subscription.plan.currency,
      monthlyCents: subscription.plan.price_monthly_cents,
      yearlyCents: subscription.plan.price_yearly_cents,
    },
    now,
  );
  const method = await getActivePaymentMethod(db, orgId);
  const provider = describePaymentProvider(c.env);

  return c.json({
    nextChargeAt: new Date(subscription.current_period_end).toISOString(),
    graceEndsAt: toIso(subscription.grace_ends_at),
    status: subscription.status,
    billingCycle: subscription.billing_cycle,
    amountCents: amount.amountCents,
    currency: amount.currency,
    autoCharge: provider.supportsRecurring && method !== null,
    provider: provider.key,
  });
});

subscriptionRoutes.get('/payment-method', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const methods = await listPaymentMethods(db, c.get('orgId') as string);
  const provider = describePaymentProvider(c.env);

  return c.json({
    items: methods.map(toPublicPaymentMethod),
    provider: provider.key,
    autoChargeAvailable: provider.supportsRecurring,
  });
});

subscriptionRoutes.delete('/payment-method/:id', requirePermission(PERMISSIONS.billingManage), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const now = Date.now();
  const methodId = c.req.param('id');

  const removed = await revokePaymentMethod(db, orgId, methodId, now);
  if (removed === 0) throw AppError.notFound('Método de pago no encontrado');

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId') as string,
      action: 'billing.payment_method_revoked',
      entityType: 'payment_method',
      entityId: methodId,
      ip: c.get('clientIp'),
    },
    now,
  );

  return c.json({ ok: true });
});

subscriptionRoutes.get('/plans', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const plans = await listActivePlans(db);
  const items = await Promise.all(plans.map(async (plan) => mapPlan(plan, await getPlanLimits(db, plan.id))));

  return c.json({ items });
});

subscriptionRoutes.get('/catalog', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const [plans, modules, addons] = await Promise.all([listActivePlans(db), listModules(db), listAddons(db)]);
  const planLimits = await Promise.all(
    plans.map(async (plan) => ({ key: plan.key, limits: await getPlanLimits(db, plan.id) })),
  );

  return c.json({
    plans: plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      description: plan.description,
      priceMonthlyCents: plan.price_monthly_cents,
      priceYearlyCents: plan.price_yearly_cents,
      currency: plan.currency,
      limits: planLimits.find((item) => item.key === plan.key)?.limits ?? {},
    })),
    modules: modules.map((module) => ({
      key: module.key,
      name: module.name,
      description: module.description,
      priceMonthlyCents: module.price_monthly_cents,
      priceYearlyCents: module.price_yearly_cents,
      isCore: module.is_core === 1,
      isActive: module.is_active === 1,
      dependencyKeys: module.dependencyKeys,
      includedIn: module.planKeys,
      features: parseFeatures(module.features_json),
    })),
    addons: addons.map((addon) => ({
      key: addon.key,
      name: addon.name,
      description: addon.description,
      metric: addon.metric,
      unitAmount: addon.unit_amount,
      unitLabel: addon.unit_label,
      priceMonthlyCents: addon.price_monthly_cents,
      priceYearlyCents: addon.price_yearly_cents,
      isActive: addon.is_active === 1,
      maxByPlan: Object.fromEntries(addon.plans.map((item) => [item.planKey, item.maxQuantity])),
    })),
  });
});

subscriptionRoutes.post('/quote', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, subscriptionQuoteSchema);

  try {
    const catalog = await loadPlanCatalog(db, input.planKey);
    return c.json({ quote: quoteSubscription(catalog, input) });
  } catch (error) {
    if (error instanceof PricingError) {
      throw new AppError(error.code, 400, error.message, error.details);
    }
    throw error;
  }
});

subscriptionRoutes.get('/requests', requirePermission(PERMISSIONS.billingRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const pending = await getPendingSubscriptionRequest(db, orgId);

  return c.json({
    freePlanUsed: await hasUsedFreePlan(db, orgId),
    pending: pending ? mapSubscriptionRequest(pending) : null,
  });
});

subscriptionRoutes.post('/request', requirePermission(PERMISSIONS.billingManage), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const input = await parseBody(c, subscriptionRequestSchema);
  const now = Date.now();

  const plan = await getPlanByKey(db, input.planKey);
  if (!plan || plan.is_active !== 1) throw AppError.badRequest('Ese plan no está disponible');
  if (plan.price_monthly_cents <= 0 && plan.price_yearly_cents <= 0) {
    throw AppError.badRequest('El plan gratuito se activa desde su propia tarjeta');
  }

  const subscription = await getSubscription(db, orgId);
  if (!subscription) throw AppError.notFound('Suscripción no encontrada');

  const pending = await getPendingSubscriptionRequest(db, orgId);
  if (pending) throw AppError.conflict('Ya tienes una solicitud pendiente de revisión');

  const requestId = await createSubscriptionRequest(
    db,
    { orgId, requestedBy: c.get('userId') as string, planId: plan.id, billingCycle: input.billingCycle, note: input.note },
    now,
  );

  await recordSubscriptionEvent(
    db,
    {
      orgId,
      subscriptionId: subscription.id,
      type: 'plan_requested',
      data: { planKey: plan.key, billingCycle: input.billingCycle, requestId },
      actorUserId: c.get('userId'),
    },
    now,
  );

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId'),
      action: 'subscription.plan_requested',
      entityType: 'subscription_request',
      entityId: requestId,
      after: { plan: plan.key, billingCycle: input.billingCycle },
    },
    now,
  );

  return c.json(
    { ok: true, id: requestId, message: 'Solicitud enviada. El administrador verificará tu pago antes de activar el plan.' },
    201,
  );
});

subscriptionRoutes.post('/start-free', requirePermission(PERMISSIONS.billingManage), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const now = Date.now();

  const plan = await getPlanByKey(db, 'trial');
  if (!plan || plan.is_active !== 1) throw AppError.badRequest('El plan gratuito no está disponible');

  if (await hasUsedFreePlan(db, orgId)) {
    throw AppError.conflict('El plan gratuito ya fue utilizado en este negocio');
  }

  const subscription = await getSubscription(db, orgId);
  if (!subscription) throw AppError.notFound('Suscripción no encontrada');

  const days = plan.trial_days || 15;
  await startFreeSubscription(db, { orgId, planId: plan.id, days, graceDays: plan.grace_days }, now);

  await recordSubscriptionEvent(
    db,
    { orgId, subscriptionId: subscription.id, type: 'free_plan_started', data: { days }, actorUserId: c.get('userId') },
    now,
  );

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId'),
      action: 'subscription.free_plan_started',
      entityType: 'subscription',
      entityId: subscription.id,
      after: { plan: plan.key, days },
    },
    now,
  );

  return c.json({ ok: true, message: `Plan gratuito activado por ${days} días.` });
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
