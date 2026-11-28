import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { paginated, parseBody, parseQuery } from '../middleware/core';
import { requireAuth, requirePlatformAdmin } from '../middleware/guards';
import {
  paginationSchema,
  adminOrganizationUpdateSchema,
  adminPlanSchema,
  subscriptionRequestResolutionSchema,
  moduleCatalogSchema,
  addonCatalogSchema,
  subscriptionQuoteSchema,
} from '../../shared/validation';
import {
  getAdminOverview,
  getPlatformSetting,
  listOrganizationsAdmin,
  listUsersAdmin,
  setOrgStatus,
  setPlatformSetting,
  upsertPlan,
  type PlanWriteInput,
} from '../repositories/admin';
import {
  activateSubscriptionForPeriod,
  confirmBillingPayment,
  createInvoice,
  getBillingPayment,
  getPlanByKey,
  getPlanById,
  getPlanLimits,
  getSubscription,
  getSubscriptionRequestById,
  listAllPlans,
  listPendingBillingPayments,
  listSubscriptionRequests,
  markInvoicePaid,
  recordSubscriptionEvent,
  resolveSubscriptionRequest,
  setSubscriptionStatus,
  extendTrial,
  changeSubscriptionPlan,
  type PlanRow,
} from '../repositories/subscriptions';
import { writeAudit } from '../repositories/audit';
import { listAttempts, scheduleAttemptRetry, type BillingAttemptView } from '../repositories/billing-attempts';
import { describePaymentProvider } from '../services/payments';
import { listUpcomingCharges } from '../services/billing-cycle';
import { PricingError } from '../../shared/billing/pricing';
import {
  applySubscriptionConfig,
  getSubscriptionConfig,
  previewSubscriptionConfig,
} from '../services/subscription-config';
import {
  createAddon as createCatalogAddon,
  createModule as createCatalogModule,
  getAddonById as getCatalogAddonById,
  getModuleById as getCatalogModuleById,
  listAddons as listCatalogAddons,
  listModules as listCatalogModules,
  updateAddon as updateCatalogAddon,
  updateModule as updateCatalogModule,
  type CatalogAddon,
  type CatalogModule,
} from '../repositories/catalog';
import { sendEmail } from '../services/mailer';
import { subscriptionReceiptEmail } from '../services/emails';
import { formatMoney } from '../../shared/finance/money';
import { mapPlan } from './mappers';
import { toIso } from '../lib/crypto';
import type { AppEnv } from '../types';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', requireAuth, requirePlatformAdmin);

async function planSummaries(db: ReturnType<typeof dbFrom>) {
  const plans = await listAllPlans(db);
  return Promise.all(
    plans.map(async (plan: PlanRow) => {
      const limits = await getPlanLimits(db, plan.id);
      return { ...mapPlan(plan, limits), createdAt: new Date(plan.created_at).toISOString(), updatedAt: new Date(plan.updated_at).toISOString() };
    }),
  );
}

function mapCatalogModule(row: CatalogModule) {
  let features: string[] = [];
  try {
    features = JSON.parse(row.features_json) as string[];
  } catch {
    features = [];
  }

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    priceMonthlyCents: row.price_monthly_cents,
    priceYearlyCents: row.price_yearly_cents,
    currency: row.currency,
    isCore: row.is_core === 1,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
    features,
    dependencyKeys: row.dependencyKeys,
    planKeys: row.planKeys,
  };
}

function mapCatalogAddon(row: CatalogAddon) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    metric: row.metric,
    unitAmount: row.unit_amount,
    unitLabel: row.unit_label,
    priceMonthlyCents: row.price_monthly_cents,
    priceYearlyCents: row.price_yearly_cents,
    currency: row.currency,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
    plans: row.plans,
  };
}

async function assertCatalogKeys(db: ReturnType<typeof dbFrom>, table: 'modules' | 'plans', keys: string[]) {
  if (keys.length === 0) return;
  const rows = await db.all<{ key: string }>(
    `SELECT key FROM ${table} WHERE key IN (${keys.map(() => '?').join(', ')})`,
    keys,
  );
  const found = new Set(rows.map((row) => row.key));
  const missing = keys.filter((key) => !found.has(key));
  if (missing.length > 0) throw AppError.badRequest(`No existe: ${missing.join(', ')}`);
}

adminRoutes.get('/overview', async (c) => {
  const db = dbFrom(c.env.DB);
  const now = Date.now();
  const overview = await getAdminOverview(db, now);

  return c.json({
    organizations: overview.organizations,
    activeSubscriptions: overview.activeSubscriptions,
    trialing: overview.trialing,
    canceledLast30Days: overview.canceledLast30Days,
    mrrCents: overview.mrrCents,
    arrCents: overview.mrrCents * 12,
    users: overview.users,
    clients: overview.clients,
    activeLoans: overview.activeLoans,
    portfolioOutstandingCents: overview.portfolioOutstandingCents,
  });
});

adminRoutes.get('/organizations', async (c) => {
  const db = dbFrom(c.env.DB);
  const query = parseQuery(c, paginationSchema);
  const { items, total } = await listOrganizationsAdmin(db, {
    search: query.search,
    status: query.status,
    page: query.page,
    pageSize: query.pageSize,
  });

  return c.json(
    paginated(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        status: item.status,
        currency: item.currency,
        createdAt: new Date(item.created_at).toISOString(),
        ownerName: item.owner_name,
        ownerEmail: item.owner_email,
        planKey: item.plan_key,
        subscriptionStatus: item.subscription_status,
        trialEndsAt: toIso(item.trial_ends_at),
        currentPeriodEnd: item.current_period_end ? new Date(item.current_period_end).toISOString() : null,
        membersCount: item.members_count,
        clientsCount: item.clients_count,
        activeLoansCount: item.active_loans,
        portfolioOutstandingCents: item.outstanding_cents,
      })),
      query.page,
      query.pageSize,
      total,
    ),
  );
});

adminRoutes.patch('/organizations/:id', async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.req.param('id');
  const input = await parseBody(c, adminOrganizationUpdateSchema);
  const now = Date.now();

  const org = await db.first<{ id: string; name: string }>(`SELECT id, name FROM organizations WHERE id = ?`, [orgId]);
  if (!org) throw AppError.notFound('Organización no encontrada');

  if (input.status) await setOrgStatus(db, orgId, input.status, now);
  if (input.trialDays !== undefined) await extendTrial(db, orgId, input.trialDays, now);
  if (input.subscriptionStatus) await setSubscriptionStatus(db, orgId, input.subscriptionStatus, now);

  if (input.planKey) {
    const plan = await getPlanByKey(db, input.planKey);
    if (!plan) throw AppError.badRequest('Plan no encontrado');
    const subscription = await getSubscription(db, orgId);
    await changeSubscriptionPlan(
      db,
      { orgId, planId: plan.id, billingCycle: subscription?.billing_cycle ?? 'monthly', graceDays: plan.grace_days },
      now,
    );
  }

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'admin.organization_updated', entityType: 'organization', entityId: orgId, after: input },
    now,
  );

  return c.json({ ok: true });
});

adminRoutes.get('/users', async (c) => {
  const db = dbFrom(c.env.DB);
  const query = parseQuery(c, paginationSchema);
  const { items, total } = await listUsersAdmin(db, { search: query.search, page: query.page, pageSize: query.pageSize });

  return c.json(
    paginated(
      items.map((item) => ({
        id: item.id,
        email: item.email,
        fullName: item.full_name,
        status: item.status,
        emailVerified: item.email_verified_at !== null,
        isPlatformAdmin: item.is_platform_admin === 1,
        organizations: item.orgs_count,
        createdAt: new Date(item.created_at).toISOString(),
        lastLoginAt: toIso(item.last_login_at),
      })),
      query.page,
      query.pageSize,
      total,
    ),
  );
});

adminRoutes.get('/plans', async (c) => {
  const db = dbFrom(c.env.DB);
  return c.json({ items: await planSummaries(db) });
});

adminRoutes.post('/plans', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, adminPlanSchema);
  const now = Date.now();

  const payload: PlanWriteInput = {
    key: input.key,
    name: input.name,
    description: input.description,
    priceMonthlyCents: input.priceMonthlyCents,
    priceYearlyCents: input.priceYearlyCents,
    currency: input.currency,
    trialDays: input.trialDays,
    graceDays: input.graceDays,
    isActive: input.isActive,
    isPublic: input.isPublic,
    sortOrder: input.sortOrder,
    features: input.features,
    limits: input.limits,
  };

  const planId = await upsertPlan(db, payload, now);
  await writeAudit(
    db,
    { orgId: null, actorUserId: c.get('userId'), action: 'admin.plan_upserted', entityType: 'plan', entityId: planId, after: { key: input.key } },
    now,
  );

  return c.json({ ok: true, planId }, 201);
});

adminRoutes.get('/catalog', async (c) => {
  const db = dbFrom(c.env.DB);
  const [modules, addons, plans] = await Promise.all([
    listCatalogModules(db),
    listCatalogAddons(db),
    listAllPlans(db),
  ]);

  return c.json({
    modules: modules.map(mapCatalogModule),
    addons: addons.map(mapCatalogAddon),
    plans: plans.map((plan) => ({ key: plan.key, name: plan.name, isActive: plan.is_active === 1 })),
  });
});

adminRoutes.post('/modules', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, moduleCatalogSchema);
  const now = Date.now();
  const dependencyKeys = input.dependencyKeys.filter((key) => key !== input.key);

  const existing = await db.first<{ id: string }>(`SELECT id FROM modules WHERE key = ?`, [input.key]);
  if (existing) throw AppError.conflict('Ya existe un módulo con esa clave');
  await assertCatalogKeys(db, 'modules', dependencyKeys);
  await assertCatalogKeys(db, 'plans', input.planKeys);

  const id = await createCatalogModule(db, { ...input, dependencyKeys }, now);
  await writeAudit(
    db,
    { orgId: null, actorUserId: c.get('userId'), action: 'admin.module_created', entityType: 'module', entityId: id, after: { key: input.key } },
    now,
  );

  return c.json({ ok: true, id }, 201);
});

adminRoutes.patch('/modules/:id', async (c) => {
  const db = dbFrom(c.env.DB);
  const id = c.req.param('id');
  const current = await getCatalogModuleById(db, id);
  if (!current) throw AppError.notFound('Módulo no encontrado');

  const input = await parseBody(c, moduleCatalogSchema);
  const now = Date.now();
  const dependencyKeys = input.dependencyKeys.filter((key) => key !== input.key);

  const duplicate = await db.first<{ id: string }>(`SELECT id FROM modules WHERE key = ? AND id <> ?`, [input.key, id]);
  if (duplicate) throw AppError.conflict('Ya existe un módulo con esa clave');
  await assertCatalogKeys(db, 'modules', dependencyKeys);
  await assertCatalogKeys(db, 'plans', input.planKeys);

  await updateCatalogModule(db, id, { ...input, dependencyKeys }, now);
  await writeAudit(
    db,
    {
      orgId: null,
      actorUserId: c.get('userId'),
      action: 'admin.module_updated',
      entityType: 'module',
      entityId: id,
      before: { key: current.key },
      after: { key: input.key },
    },
    now,
  );

  return c.json({ ok: true });
});

adminRoutes.post('/addons', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, addonCatalogSchema);
  const now = Date.now();

  const existing = await db.first<{ id: string }>(`SELECT id FROM addons WHERE key = ?`, [input.key]);
  if (existing) throw AppError.conflict('Ya existe un complemento con esa clave');
  await assertCatalogKeys(db, 'plans', input.plans.map((plan) => plan.planKey));

  const id = await createCatalogAddon(db, input, now);
  await writeAudit(
    db,
    { orgId: null, actorUserId: c.get('userId'), action: 'admin.addon_created', entityType: 'addon', entityId: id, after: { key: input.key } },
    now,
  );

  return c.json({ ok: true, id }, 201);
});

adminRoutes.patch('/addons/:id', async (c) => {
  const db = dbFrom(c.env.DB);
  const id = c.req.param('id');
  const current = await getCatalogAddonById(db, id);
  if (!current) throw AppError.notFound('Complemento no encontrado');

  const input = await parseBody(c, addonCatalogSchema);
  const now = Date.now();

  const duplicate = await db.first<{ id: string }>(`SELECT id FROM addons WHERE key = ? AND id <> ?`, [input.key, id]);
  if (duplicate) throw AppError.conflict('Ya existe un complemento con esa clave');
  await assertCatalogKeys(db, 'plans', input.plans.map((plan) => plan.planKey));

  await updateCatalogAddon(db, id, input, now);
  await writeAudit(
    db,
    {
      orgId: null,
      actorUserId: c.get('userId'),
      action: 'admin.addon_updated',
      entityType: 'addon',
      entityId: id,
      before: { key: current.key },
      after: { key: input.key },
    },
    now,
  );

  return c.json({ ok: true });
});

function mapBillingAttempt(attempt: BillingAttemptView) {
  return {
    id: attempt.id,
    orgId: attempt.org_id,
    orgName: attempt.org_name,
    invoiceId: attempt.invoice_id,
    invoiceNumber: attempt.invoice_number,
    provider: attempt.provider,
    reference: attempt.provider_ref,
    amountCents: attempt.amount_cents,
    currency: attempt.currency,
    status: attempt.status,
    attemptNo: attempt.attempt_no,
    errorCode: attempt.error_code,
    errorMessage: attempt.error_message,
    nextRetryAt: toIso(attempt.next_retry_at),
    createdAt: new Date(attempt.created_at).toISOString(),
  };
}

adminRoutes.get('/billing/status', async (c) => {
  const db = dbFrom(c.env.DB);
  const provider = describePaymentProvider(c.env);
  const methods = await db.first<{ total: number; active: number | null }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active FROM payment_methods`,
  );

  return c.json({
    provider,
    paymentMethods: {
      total: Number(methods?.total ?? 0),
      active: Number(methods?.active ?? 0),
    },
  });
});

adminRoutes.get('/billing/attempts', async (c) => {
  const db = dbFrom(c.env.DB);
  const status = c.req.query('status') ?? null;
  const attempts = await listAttempts(db, status, 100);
  return c.json({ items: attempts.map(mapBillingAttempt) });
});

adminRoutes.get('/billing/upcoming', async (c) => {
  const db = dbFrom(c.env.DB);
  const days = Number(c.req.query('days') ?? 30);
  const charges = await listUpcomingCharges(db, Date.now(), Number.isFinite(days) ? days : 30, 100);

  return c.json({
    items: charges.map((charge) => ({ ...charge, dueAt: new Date(charge.dueAt).toISOString() })),
  });
});

adminRoutes.post('/billing/attempts/:id/retry', async (c) => {
  const db = dbFrom(c.env.DB);
  const now = Date.now();
  const attemptId = c.req.param('id');

  const changed = await scheduleAttemptRetry(db, attemptId, now);
  if (changed === 0) throw AppError.conflict('Solo se pueden reintentar cobros fallidos');

  await writeAudit(
    db,
    {
      orgId: null,
      actorUserId: c.get('userId'),
      action: 'admin.billing_retry_scheduled',
      entityType: 'billing_payment',
      entityId: attemptId,
    },
    now,
  );

  return c.json({ ok: true });
});

adminRoutes.get('/billing-payments', async (c) => {
  const db = dbFrom(c.env.DB);
  const items = await listPendingBillingPayments(db);

  return c.json({
    items: items.map((item) => ({
      id: item.id,
      orgId: item.org_id,
      orgName: item.org_name,
      invoiceId: item.invoice_id,
      provider: item.provider,
      reference: item.provider_ref,
      amountCents: item.amount_cents,
      currency: item.currency,
      createdAt: new Date(item.created_at).toISOString(),
    })),
  });
});

adminRoutes.post('/billing-payments/:id/confirm', async (c) => {
  const db = dbFrom(c.env.DB);
  const payment = await getBillingPayment(db, c.req.param('id'));
  if (!payment) throw AppError.notFound('Pago no encontrado');
  if (payment.status !== 'pending') throw AppError.conflict('Este pago ya fue procesado');

  const now = Date.now();
  const subscription = await getSubscription(db, payment.org_id);
  if (!subscription) throw AppError.conflict('La organización no tiene suscripción');

  await confirmBillingPayment(db, { orgId: payment.org_id, billingPaymentId: payment.id, userId: c.get('userId') as string }, now);

  if (payment.invoice_id) {
    await markInvoicePaid(db, payment.org_id, payment.invoice_id, now);
  }

  await activateSubscriptionForPeriod(
    db,
    { orgId: payment.org_id, planId: subscription.plan.id, billingCycle: subscription.billing_cycle, graceDays: subscription.plan.grace_days },
    now,
  );

  await recordSubscriptionEvent(
    db,
    { orgId: payment.org_id, subscriptionId: subscription.id, type: 'payment_confirmed', data: { amountCents: payment.amount_cents }, actorUserId: c.get('userId') },
    now,
  );

  await writeAudit(
    db,
    {
      orgId: payment.org_id,
      actorUserId: c.get('userId'),
      action: 'admin.billing_payment_confirmed',
      entityType: 'billing_payment',
      entityId: payment.id,
      after: { amountCents: payment.amount_cents },
    },
    now,
  );

  if (payment.invoice_id) {
    const invoice = await db.first<{ number: string; amount_cents: number; currency: string }>(
      `SELECT number, amount_cents, currency FROM invoices WHERE id = ?`,
      [payment.invoice_id],
    );
    if (invoice) {
      const owner = await db.first<{ email: string }>(
        `SELECT u.email FROM organizations o JOIN users u ON u.id = o.owner_user_id WHERE o.id = ?`,
        [payment.org_id],
      );
      if (owner) {
        const message = subscriptionReceiptEmail(
          subscription.plan.name,
          subscription.plan.name,
          formatMoney(invoice.amount_cents, invoice.currency as 'NIO' | 'USD'),
          `Factura ${invoice.number}`,
        );
        await sendEmail(c.env, { to: owner.email, subject: message.subject, text: message.text, html: message.html });
      }
    }
  }

  return c.json({ ok: true });
});

adminRoutes.get('/subscription-requests', async (c) => {
  const db = dbFrom(c.env.DB);
  const status = c.req.query('status') ?? 'pending';
  if (!['pending', 'approved', 'rejected', 'canceled'].includes(status)) {
    throw AppError.badRequest('Estado de solicitud inválido');
  }

  const items = await listSubscriptionRequests(db, status);

  return c.json({
    items: items.map((item) => ({
      id: item.id,
      orgId: item.org_id,
      orgName: item.org_name,
      planKey: item.plan_key,
      planName: item.plan_name,
      billingCycle: item.billing_cycle,
      amountCents: item.billing_cycle === 'yearly' ? item.price_yearly_cents : item.price_monthly_cents,
      currency: item.currency,
      status: item.status,
      note: item.note,
      adminNote: item.admin_note,
      requestedBy: item.requester_email,
      createdAt: new Date(item.created_at).toISOString(),
    })),
  });
});

adminRoutes.post('/subscription-requests/:id/approve', async (c) => {
  const db = dbFrom(c.env.DB);
  const request = await getSubscriptionRequestById(db, c.req.param('id'));
  if (!request) throw AppError.notFound('Solicitud no encontrada');
  if (request.status !== 'pending') throw AppError.conflict('Esta solicitud ya fue procesada');

  const plan = await getPlanById(db, request.plan_id);
  if (!plan) throw AppError.conflict('El plan solicitado ya no existe');

  const subscription = await getSubscription(db, request.org_id);
  if (!subscription) throw AppError.conflict('La organización no tiene suscripción');

  const now = Date.now();
  const userId = c.get('userId') as string;
  const amountCents = request.billing_cycle === 'yearly' ? plan.price_yearly_cents : plan.price_monthly_cents;

  await activateSubscriptionForPeriod(
    db,
    { orgId: request.org_id, planId: plan.id, billingCycle: request.billing_cycle, graceDays: plan.grace_days },
    now,
  );
  await resolveSubscriptionRequest(db, { id: request.id, status: 'approved', resolvedBy: userId }, now);

  if (amountCents > 0) {
    const invoiceId = await createInvoice(
      db,
      {
        orgId: request.org_id,
        subscriptionId: subscription.id,
        amountCents,
        currency: plan.currency,
        dueInDays: 0,
        notes: `Plan ${plan.name} (${request.billing_cycle}) aprobado por el administrador`,
      },
      now,
    );
    await markInvoicePaid(db, request.org_id, invoiceId, now);
  }

  await recordSubscriptionEvent(
    db,
    {
      orgId: request.org_id,
      subscriptionId: subscription.id,
      type: 'plan_request_approved',
      data: { planKey: plan.key, billingCycle: request.billing_cycle, amountCents },
      actorUserId: userId,
    },
    now,
  );

  await writeAudit(
    db,
    {
      orgId: request.org_id,
      actorUserId: userId,
      action: 'admin.subscription_request_approved',
      entityType: 'subscription_request',
      entityId: request.id,
      after: { plan: plan.key, billingCycle: request.billing_cycle, amountCents },
    },
    now,
  );

  return c.json({ ok: true });
});

adminRoutes.post('/subscription-requests/:id/reject', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, subscriptionRequestResolutionSchema);
  const request = await getSubscriptionRequestById(db, c.req.param('id'));
  if (!request) throw AppError.notFound('Solicitud no encontrada');
  if (request.status !== 'pending') throw AppError.conflict('Esta solicitud ya fue procesada');

  const now = Date.now();
  const userId = c.get('userId') as string;

  await resolveSubscriptionRequest(
    db,
    { id: request.id, status: 'rejected', adminNote: input.note, resolvedBy: userId },
    now,
  );

  await recordSubscriptionEvent(
    db,
    {
      orgId: request.org_id,
      subscriptionId: (await getSubscription(db, request.org_id))?.id ?? request.org_id,
      type: 'plan_request_rejected',
      data: { planKey: request.plan_key, note: input.note ?? null },
      actorUserId: userId,
    },
    now,
  );

  await writeAudit(
    db,
    {
      orgId: request.org_id,
      actorUserId: userId,
      action: 'admin.subscription_request_rejected',
      entityType: 'subscription_request',
      entityId: request.id,
      after: { plan: request.plan_key, note: input.note ?? null },
    },
    now,
  );

  return c.json({ ok: true });
});

adminRoutes.post('/organizations/:id/invoice', async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.req.param('id');
  const subscription = await getSubscription(db, orgId);
  if (!subscription) throw AppError.conflict('La organización no tiene suscripción');

  const now = Date.now();
  const amount =
    subscription.billing_cycle === 'yearly' ? subscription.plan.price_yearly_cents : subscription.plan.price_monthly_cents;
  if (amount <= 0) throw AppError.badRequest('El plan actual no genera cobro');

  const invoiceId = await createInvoice(
    db,
    {
      orgId,
      subscriptionId: subscription.id,
      amountCents: amount,
      currency: subscription.plan.currency,
      dueInDays: 7,
      notes: `Suscripción ${subscription.plan.name} (${subscription.billing_cycle})`,
    },
    now,
  );

  await writeAudit(
    db,
    { orgId, actorUserId: c.get('userId'), action: 'admin.invoice_created', entityType: 'invoice', entityId: invoiceId, after: { amount } },
    now,
  );

  return c.json({ ok: true, invoiceId }, 201);
});

adminRoutes.get('/organizations/:id', async (c) => {
  const db = dbFrom(c.env.DB);
  const org = await db.first<{
    id: string;
    name: string;
    slug: string;
    currency: string;
    status: string;
    created_at: number;
  }>(
    `SELECT id, name, slug, currency, status, created_at FROM organizations WHERE id = ?`,
    [c.req.param('id')],
  );
  if (!org) throw AppError.notFound('Organización no encontrada');

  return c.json({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      currency: org.currency,
      status: org.status,
      createdAt: new Date(org.created_at).toISOString(),
    },
  });
});

adminRoutes.get('/organizations/:id/subscription-config', async (c) => {
  const db = dbFrom(c.env.DB);
  return c.json({ config: await getSubscriptionConfig(db, c.req.param('id')) });
});

adminRoutes.post('/organizations/:id/subscription-config/preview', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, subscriptionQuoteSchema);

  try {
    return c.json(await previewSubscriptionConfig(db, c.req.param('id'), input));
  } catch (error) {
    if (error instanceof PricingError) throw new AppError(error.code, 400, error.message, error.details);
    throw error;
  }
});

adminRoutes.post('/organizations/:id/subscription-config', async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.req.param('id');
  const userId = c.get('userId') as string;
  const input = await parseBody(c, subscriptionQuoteSchema);
  const now = Date.now();

  try {
    const result = await applySubscriptionConfig(db, { orgId, config: input, actorUserId: userId }, now);

    await writeAudit(
      db,
      {
        orgId,
        actorUserId: userId,
        action: 'admin.subscription_config_updated',
        entityType: 'subscription',
        entityId: orgId,
        after: {
          planKey: input.planKey,
          billingCycle: input.billingCycle,
          moduleKeys: input.moduleKeys,
          addons: input.addons,
        },
      },
      now,
    );

    return c.json({ ok: true, quote: result.quote });
  } catch (error) {
    if (error instanceof PricingError) throw new AppError(error.code, 400, error.message, error.details);
    throw error;
  }
});

adminRoutes.get('/settings', async (c) => {
  const db = dbFrom(c.env.DB);
  const defaults = await getPlatformSetting(db, 'platform.defaults');
  return c.json({ defaults });
});

adminRoutes.patch('/settings', async (c) => {
  const db = dbFrom(c.env.DB);
  const body = await c.req.json<{ defaults?: Record<string, unknown> }>();
  if (!body.defaults || typeof body.defaults !== 'object') throw AppError.badRequest('Configuración inválida');

  await setPlatformSetting(db, 'platform.defaults', body.defaults, c.get('userId'), Date.now());
  await writeAudit(
    db,
    { orgId: null, actorUserId: c.get('userId'), action: 'admin.settings_updated', entityType: 'settings', entityId: 'platform.defaults' },
    Date.now(),
  );

  return c.json({ ok: true });
});
