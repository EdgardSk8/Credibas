import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { paginated, parseBody, parseQuery } from '../middleware/core';
import { requireAuth, requirePlatformAdmin } from '../middleware/guards';
import { paginationSchema, adminOrganizationUpdateSchema, adminPlanSchema } from '../../shared/validation';
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
  getPlanLimits,
  getSubscription,
  listAllPlans,
  listPendingBillingPayments,
  markInvoicePaid,
  recordSubscriptionEvent,
  setSubscriptionStatus,
  extendTrial,
  changeSubscriptionPlan,
  type PlanRow,
} from '../repositories/subscriptions';
import { writeAudit } from '../repositories/audit';
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
      { orgId, planId: plan.id, billingCycle: subscription?.billing_cycle ?? 'monthly' },
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
    { orgId: payment.org_id, planId: subscription.plan.id, billingCycle: subscription.billing_cycle },
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
