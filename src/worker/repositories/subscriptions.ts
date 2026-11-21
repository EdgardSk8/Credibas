import type { Db } from '../db';
import { newId } from '../lib/crypto';

export interface PlanRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  trial_days: number;
  grace_days: number;
  is_active: number;
  is_public: number;
  sort_order: number;
  features_json: string;
  created_at: number;
  updated_at: number;
}

export interface SubscriptionRow {
  id: string;
  org_id: string;
  plan_id: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  billing_cycle: 'monthly' | 'yearly';
  trial_ends_at: number | null;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: number;
  canceled_at: number | null;
  created_at: number;
  updated_at: number;
}

const PLAN_COLUMNS = `id, key, name, description, price_monthly_cents, price_yearly_cents, currency, trial_days,
  grace_days, is_active, is_public, sort_order, features_json, created_at, updated_at`;

export async function listPublicPlans(db: Db): Promise<PlanRow[]> {
  return db.all<PlanRow>(
    `SELECT ${PLAN_COLUMNS} FROM plans WHERE is_active = 1 AND is_public = 1 ORDER BY sort_order ASC`,
  );
}

export async function listAllPlans(db: Db): Promise<PlanRow[]> {
  return db.all<PlanRow>(`SELECT ${PLAN_COLUMNS} FROM plans ORDER BY sort_order ASC`);
}

export async function getPlanByKey(db: Db, key: string): Promise<PlanRow | null> {
  return db.first<PlanRow>(`SELECT ${PLAN_COLUMNS} FROM plans WHERE key = ?`, [key]);
}

export async function getPlanById(db: Db, id: string): Promise<PlanRow | null> {
  return db.first<PlanRow>(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ?`, [id]);
}

export async function getPlanLimits(db: Db, planId: string): Promise<Record<string, number>> {
  const rows = await db.all<{ limit_key: string; limit_value: number }>(
    `SELECT limit_key, limit_value FROM plan_limits WHERE plan_id = ?`,
    [planId],
  );
  const limits: Record<string, number> = {};
  for (const row of rows) limits[row.limit_key] = Number(row.limit_value);
  return limits;
}

export interface SubscriptionWithPlan extends SubscriptionRow {
  plan: PlanRow;
}

export async function getSubscription(db: Db, orgId: string): Promise<SubscriptionWithPlan | null> {
  const subscription = await db.first<SubscriptionRow>(
    `SELECT id, org_id, plan_id, status, billing_cycle, trial_ends_at, current_period_start, current_period_end,
            cancel_at_period_end, canceled_at, created_at, updated_at
       FROM subscriptions WHERE org_id = ?`,
    [orgId],
  );
  if (!subscription) return null;
  const plan = await getPlanById(db, subscription.plan_id);
  if (!plan) return null;
  return { ...subscription, plan };
}

export interface OrgUsage {
  members: number;
  clients: number;
  activeLoans: number;
  collectors: number;
  storageBytes: number;
}

export async function getOrgUsage(db: Db, orgId: string): Promise<OrgUsage> {
  const row = await db.first<{ members: number; clients: number; activeLoans: number; collectors: number; storageBytes: number }>(
    `SELECT
      (SELECT COUNT(*) FROM organization_members WHERE org_id = ? AND status IN ('active', 'invited')) AS members,
      (SELECT COUNT(*) FROM clients WHERE org_id = ? AND deleted_at IS NULL) AS clients,
      (SELECT COUNT(*) FROM loans WHERE org_id = ? AND status = 'active' AND deleted_at IS NULL) AS activeLoans,
      (SELECT COUNT(*) FROM organization_members m JOIN roles r ON r.id = m.role_id
        WHERE m.org_id = ? AND m.status = 'active' AND r.key = 'collector') AS collectors,
      (SELECT COALESCE(SUM(size_bytes), 0) FROM client_documents WHERE org_id = ?) AS storageBytes`,
    [orgId, orgId, orgId, orgId, orgId],
  );
  return {
    members: Number(row?.members ?? 0),
    clients: Number(row?.clients ?? 0),
    activeLoans: Number(row?.activeLoans ?? 0),
    collectors: Number(row?.collectors ?? 0),
    storageBytes: Number(row?.storageBytes ?? 0),
  };
}

export async function changeSubscriptionPlan(
  db: Db,
  input: { orgId: string; planId: string; billingCycle: 'monthly' | 'yearly'; status?: SubscriptionRow['status'] },
  now: number,
): Promise<void> {
  const periodMs = input.billingCycle === 'yearly' ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  await db.run(
    `UPDATE subscriptions
        SET plan_id = ?, billing_cycle = ?, status = COALESCE(?, status), current_period_start = ?,
            current_period_end = ?, cancel_at_period_end = 0, canceled_at = NULL, updated_at = ?
      WHERE org_id = ?`,
    [input.planId, input.billingCycle, input.status ?? null, now, now + periodMs, now, input.orgId],
  );
}

export async function setSubscriptionStatus(
  db: Db,
  orgId: string,
  status: SubscriptionRow['status'],
  now: number,
): Promise<void> {
  await db.run(`UPDATE subscriptions SET status = ?, updated_at = ? WHERE org_id = ?`, [status, now, orgId]);
}

export async function cancelSubscription(db: Db, orgId: string, immediately: boolean, now: number): Promise<void> {
  await db.run(
    `UPDATE subscriptions
        SET cancel_at_period_end = ?, canceled_at = ?, status = CASE WHEN ? THEN 'canceled' ELSE status END, updated_at = ?
      WHERE org_id = ?`,
    [immediately ? 0 : 1, now, immediately ? 1 : 0, now, orgId],
  );
}

export async function resumeSubscription(db: Db, orgId: string, now: number): Promise<void> {
  await db.run(
    `UPDATE subscriptions SET cancel_at_period_end = 0, canceled_at = NULL, updated_at = ? WHERE org_id = ?`,
    [now, orgId],
  );
}

export async function extendTrial(db: Db, orgId: string, days: number, now: number): Promise<void> {
  const current = await db.first<{ trial_ends_at: number | null; current_period_end: number }>(
    `SELECT trial_ends_at, current_period_end FROM subscriptions WHERE org_id = ?`,
    [orgId],
  );
  if (!current) return;
  const base = Math.max(current.trial_ends_at ?? now, now);
  const endsAt = base + days * 24 * 60 * 60 * 1000;
  await db.run(
    `UPDATE subscriptions SET status = 'trialing', trial_ends_at = ?, current_period_end = ?, updated_at = ? WHERE org_id = ?`,
    [endsAt, endsAt, now, orgId],
  );
}

export async function recordSubscriptionEvent(
  db: Db,
  input: { orgId: string; subscriptionId: string | null; type: string; data?: unknown; actorUserId: string | null },
  now: number,
): Promise<void> {
  await db.run(
    `INSERT INTO subscription_events (id, org_id, subscription_id, type, data_json, actor_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId('sev'), input.orgId, input.subscriptionId, input.type, JSON.stringify(input.data ?? {}), input.actorUserId, now],
  );
}

// ---------------------------------------------------------------------------
// Facturación SaaS
// ---------------------------------------------------------------------------
export interface InvoiceRow {
  id: string;
  org_id: string;
  subscription_id: string | null;
  number: string;
  amount_cents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'overdue' | 'void';
  period_start: number;
  period_end: number;
  issued_at: number;
  due_at: number;
  paid_at: number | null;
  notes: string | null;
  created_at: number;
}

export async function listInvoices(db: Db, orgId: string): Promise<InvoiceRow[]> {
  return db.all<InvoiceRow>(
    `SELECT id, org_id, subscription_id, number, amount_cents, currency, status, period_start, period_end,
            issued_at, due_at, paid_at, notes, created_at
       FROM invoices WHERE org_id = ? ORDER BY issued_at DESC LIMIT 50`,
    [orgId],
  );
}

export async function createInvoice(
  db: Db,
  input: { orgId: string; subscriptionId: string | null; amountCents: number; currency: string; dueInDays: number; notes: string | null },
  now: number,
): Promise<string> {
  const id = newId('inv');
  const stamp = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
  const number = `CRB-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await db.run(
    `INSERT INTO invoices (id, org_id, subscription_id, number, amount_cents, currency, status, period_start,
       period_end, issued_at, due_at, paid_at, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL, ?, ?)`,
    [
      id,
      input.orgId,
      input.subscriptionId,
      number,
      input.amountCents,
      input.currency,
      now,
      now + 30 * 24 * 60 * 60 * 1000,
      now,
      now + input.dueInDays * 24 * 60 * 60 * 1000,
      input.notes,
      now,
    ],
  );
  return id;
}

export async function getInvoice(db: Db, orgId: string, invoiceId: string): Promise<InvoiceRow | null> {
  return db.first<InvoiceRow>(
    `SELECT id, org_id, subscription_id, number, amount_cents, currency, status, period_start, period_end,
            issued_at, due_at, paid_at, notes, created_at
       FROM invoices WHERE org_id = ? AND id = ?`,
    [orgId, invoiceId],
  );
}

export async function markInvoicePaid(db: Db, orgId: string, invoiceId: string, now: number): Promise<void> {
  await db.run(`UPDATE invoices SET status = 'paid', paid_at = ? WHERE org_id = ? AND id = ?`, [now, orgId, invoiceId]);
}

export interface BillingPaymentRow {
  id: string;
  org_id: string;
  invoice_id: string | null;
  provider: string;
  provider_ref: string | null;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  proof_r2_key: string | null;
  raw_json: string | null;
  confirmed_by: string | null;
  confirmed_at: number | null;
  created_at: number;
}

export async function createBillingPayment(
  db: Db,
  input: {
    orgId: string;
    invoiceId: string | null;
    provider: string;
    providerRef: string | null;
    amountCents: number;
    currency: string;
    status: BillingPaymentRow['status'];
    proofR2Key?: string | null;
    raw?: unknown;
  },
  now: number,
): Promise<string> {
  const id = newId('bpy');
  await db.run(
    `INSERT INTO billing_payments (id, org_id, invoice_id, provider, provider_ref, amount_cents, currency, status,
       proof_r2_key, raw_json, confirmed_by, confirmed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    [
      id,
      input.orgId,
      input.invoiceId,
      input.provider,
      input.providerRef,
      input.amountCents,
      input.currency,
      input.status,
      input.proofR2Key ?? null,
      input.raw ? JSON.stringify(input.raw) : null,
      now,
    ],
  );
  return id;
}

export async function confirmBillingPayment(
  db: Db,
  input: { orgId: string; billingPaymentId: string; userId: string },
  now: number,
): Promise<void> {
  await db.run(
    `UPDATE billing_payments SET status = 'confirmed', confirmed_by = ?, confirmed_at = ?
      WHERE org_id = ? AND id = ? AND status = 'pending'`,
    [input.userId, now, input.orgId, input.billingPaymentId],
  );
}

export async function findBillingPaymentByProviderRef(
  db: Db,
  provider: string,
  providerRef: string,
): Promise<BillingPaymentRow | null> {
  return db.first<BillingPaymentRow>(
    `SELECT id, org_id, invoice_id, provider, provider_ref, amount_cents, currency, status, proof_r2_key, raw_json,
            confirmed_by, confirmed_at, created_at
       FROM billing_payments WHERE provider = ? AND provider_ref = ?`,
    [provider, providerRef],
  );
}

export async function listBillingPayments(db: Db, orgId: string): Promise<BillingPaymentRow[]> {
  return db.all<BillingPaymentRow>(
    `SELECT id, org_id, invoice_id, provider, provider_ref, amount_cents, currency, status, proof_r2_key, raw_json,
            confirmed_by, confirmed_at, created_at
       FROM billing_payments WHERE org_id = ? ORDER BY created_at DESC LIMIT 50`,
    [orgId],
  );
}

export async function getBillingPayment(db: Db, id: string): Promise<BillingPaymentRow | null> {
  return db.first<BillingPaymentRow>(
    `SELECT id, org_id, invoice_id, provider, provider_ref, amount_cents, currency, status, proof_r2_key, raw_json,
            confirmed_by, confirmed_at, created_at
       FROM billing_payments WHERE id = ?`,
    [id],
  );
}

export async function listPendingBillingPayments(db: Db): Promise<Array<BillingPaymentRow & { org_name: string }>> {
  return db.all<BillingPaymentRow & { org_name: string }>(
    `SELECT b.id, b.org_id, b.invoice_id, b.provider, b.provider_ref, b.amount_cents, b.currency, b.status,
            b.proof_r2_key, b.raw_json, b.confirmed_by, b.confirmed_at, b.created_at, o.name AS org_name
       FROM billing_payments b
       JOIN organizations o ON o.id = b.org_id
      WHERE b.status = 'pending'
      ORDER BY b.created_at ASC
      LIMIT 100`,
  );
}

export async function activateSubscriptionForPeriod(
  db: Db,
  input: { orgId: string; planId: string; billingCycle: 'monthly' | 'yearly' },
  now: number,
): Promise<void> {
  const periodMs = input.billingCycle === 'yearly' ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  await db.run(
    `UPDATE subscriptions
        SET plan_id = ?, billing_cycle = ?, status = 'active', current_period_start = ?, current_period_end = ?,
            cancel_at_period_end = 0, canceled_at = NULL, updated_at = ?
      WHERE org_id = ?`,
    [input.planId, input.billingCycle, now, now + periodMs, now, input.orgId],
  );
}

/** Suscripción efectiva: una suscripción vencida con período de gracia vencido queda expirada. */
export async function refreshExpiredSubscriptions(db: Db, now: number): Promise<number> {
  const result = await db.run(
    `UPDATE subscriptions
        SET status = 'expired', updated_at = ?
      WHERE status IN ('trialing', 'active') AND current_period_end < ?`,
    [now, now],
  );
  return result.meta.changes ?? 0;
}
