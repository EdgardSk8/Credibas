import type { Db } from '../db';
import { dbFrom } from '../db';
import type { Env } from '../env';
import { writeAudit } from '../repositories/audit';
import {
  activateSubscriptionForPeriod,
  createInvoice,
  findInvoiceForPeriod,
  markInvoicePaid,
  recordSubscriptionEvent,
} from '../repositories/subscriptions';
import {
  createAttempt,
  latestAttemptForInvoice,
  markAttemptFailed,
  markAttemptSucceeded,
} from '../repositories/billing-attempts';
import { getActivePaymentMethod } from '../repositories/payment-methods';
import { loadPlanCatalog } from './pricing';
import { quoteSubscription } from '../../shared/billing/pricing';
import { newId } from '../lib/crypto';
import { resolvePaymentProvider, PaymentProviderUnavailable, type PaymentProvider } from './payments';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días de antelación con los que se emite y cobra la renovación. */
export const CHARGE_LEAD_DAYS = 3;

/** Espera progresiva tras cada intento fallido, en días. */
export const RETRY_DELAYS_DAYS = [1, 3, 5] as const;

export function retryDelayDays(failedAttemptNo: number): number {
  const index = Math.min(Math.max(failedAttemptNo - 1, 0), RETRY_DELAYS_DAYS.length - 1);
  return RETRY_DELAYS_DAYS[index] ?? RETRY_DELAYS_DAYS[0];
}

interface DueSubscription {
  id: string;
  org_id: string;
  plan_id: string;
  plan_key: string;
  plan_name: string;
  currency: string;
  billing_cycle: 'monthly' | 'yearly';
  status: string;
  current_period_end: number;
  grace_ends_at: number | null;
  grace_days: number;
  payment_method_id: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number;
}

export type BillingOutcome = 'charged' | 'failed' | 'awaitingPayment' | 'skipped';

export interface BillingRunResult extends Record<BillingOutcome, number> {
  due: number;
}

/**
 * Motor de cobro recurrente. Se ejecuta desde la cola (`billing.charge-due`).
 *
 * Reglas:
 * - Nunca marca pagado un cobro solo por haberlo enviado al proveedor.
 * - Cada período tiene una factura y una clave de idempotencia propias.
 * - Un fallo no suspende: deja la suscripción en `past_due` y reintenta
 *   mientras quede tolerancia (`grace_ends_at`).
 */
export interface BillingRunOptions {
  /** Permite inyectar un proveedor en pruebas; en producción se resuelve del entorno. */
  provider?: PaymentProvider;
}

export async function runBillingCycle(
  env: Env,
  now: number,
  options: BillingRunOptions = {},
): Promise<BillingRunResult> {
  const db = dbFrom(env.DB);
  const provider = options.provider ?? resolvePaymentProvider(env);
  const result: BillingRunResult = { due: 0, charged: 0, failed: 0, awaitingPayment: 0, skipped: 0 };

  const rows = await db.all<DueSubscription>(
    `SELECT s.id, s.org_id, s.plan_id, s.billing_cycle, s.status, s.current_period_end, s.grace_ends_at,
            s.payment_method_id,
            p.key AS plan_key, p.name AS plan_name, p.currency, p.grace_days,
            p.price_monthly_cents, p.price_yearly_cents
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.status IN ('active', 'past_due')
        AND s.cancel_at_period_end = 0
        AND s.current_period_end <= ?
      ORDER BY s.current_period_end ASC
      LIMIT 200`,
    [now + CHARGE_LEAD_DAYS * DAY_MS],
  );
  result.due = rows.length;

  for (const row of rows) {
    try {
      const outcome = await processSubscription(db, provider, row, now);
      result[outcome] += 1;
    } catch (error) {
      console.error(`[billing] no se pudo procesar la organización ${row.org_id}:`, error);
      result.failed += 1;
    }
  }

  return result;
}

async function processSubscription(
  db: Db,
  provider: PaymentProvider,
  row: DueSubscription,
  now: number,
): Promise<BillingOutcome> {
  const periodStart = Math.max(row.current_period_end, now);
  const periodMs = row.billing_cycle === 'yearly' ? 365 * DAY_MS : 30 * DAY_MS;
  const periodEnd = periodStart + periodMs;

  const { amountCents, currency } = await quoteSubscriptionAmount(
    db,
    {
      subscriptionId: row.id,
      planKey: row.plan_key,
      billingCycle: row.billing_cycle,
      currency: row.currency,
      monthlyCents: Number(row.price_monthly_cents),
      yearlyCents: Number(row.price_yearly_cents),
    },
    now,
  );
  if (amountCents <= 0) return 'skipped';

  const existing = await findInvoiceForPeriod(db, row.id, periodStart);
  if (existing?.status === 'paid') return 'skipped';

  let invoiceId = existing?.id ?? null;
  let created = false;
  if (!invoiceId) {
    invoiceId = await createInvoice(
      db,
      {
        orgId: row.org_id,
        subscriptionId: row.id,
        amountCents,
        currency,
        dueInDays: 0,
        notes: `${row.plan_name} · ${row.billing_cycle === 'yearly' ? 'anual' : 'mensual'}`,
        periodStart,
        periodEnd,
      },
      now,
    );
    created = true;
  }

  const method = provider.supportsRecurring ? await getActivePaymentMethod(db, row.org_id) : null;
  if (!provider.supportsRecurring || !method) {
    if (created) await notifyRenewal(db, row, periodStart, amountCents, currency, now);
    return 'awaitingPayment';
  }

  const last = await latestAttemptForInvoice(db, invoiceId);
  if (last) {
    if (last.status === 'confirmed') return 'skipped';
    if (last.status === 'pending') return 'skipped';
    if (last.status === 'failed' && (last.next_retry_at ?? 0) > now) return 'skipped';
  }

  const attemptNo = (last?.attempt_no ?? 0) + 1;
  const periodKey = new Date(periodStart).toISOString().slice(0, 10);
  const idempotencyKey = `sub:${row.org_id}:${periodKey}:${attemptNo}`;
  const attempt = await createAttempt(
    db,
    {
      orgId: row.org_id,
      invoiceId,
      provider: provider.key,
      paymentMethodId: method.id,
      amountCents,
      currency,
      idempotencyKey,
      attemptNo,
      request: { invoiceId, attemptNo, amountCents, currency, cardLast4: method.last4 },
    },
    now,
  );

  let charge;
  try {
    charge = await provider.charge({
      orgId: row.org_id,
      amountCents,
      currency,
      description: `Credibas ${row.plan_name} (${row.billing_cycle === 'yearly' ? 'anual' : 'mensual'})`,
      idempotencyKey,
      method: { id: method.id, token: method.provider_token_ref, brand: method.brand, last4: method.last4 },
    });
  } catch (error) {
    if (error instanceof PaymentProviderUnavailable) {
      await markAttemptFailed(db, attempt.id, {
        errorCode: error.code,
        errorMessage: error.message,
        nextRetryAt: null,
        raw: null,
      });
      return 'failed';
    }
    throw error;
  }

  if (charge.status === 'pending') return 'skipped';

  if (charge.status === 'succeeded') {
    await markAttemptSucceeded(db, attempt.id, charge.providerRef ?? idempotencyKey, charge.raw ?? null, now);
    await markInvoicePaid(db, row.org_id, invoiceId, now);
    await activateSubscriptionForPeriod(
      db,
      {
        orgId: row.org_id,
        planId: row.plan_id,
        billingCycle: row.billing_cycle,
        graceDays: row.grace_days,
        periodStart,
      },
      now,
    );
    await recordSubscriptionEvent(
      db,
      {
        orgId: row.org_id,
        subscriptionId: row.id,
        type: 'billing.payment_confirmed',
        data: { invoiceId, attemptId: attempt.id, amountCents, currency, provider: provider.key },
        actorUserId: null,
      },
      now,
    );
    await writeAudit(
      db,
      {
        orgId: row.org_id,
        actorUserId: null,
        action: 'billing.charge_confirmed',
        entityType: 'billing_payment',
        entityId: attempt.id,
        after: { invoiceId, amountCents, currency },
        ip: null,
      },
      now,
    );
    await notifyOwner(
      db,
      row.org_id,
      'billing_payment_approved',
      'Pago confirmado',
      `Cobramos ${formatAmount(amountCents, currency)} de tu plan ${row.plan_name}.`,
      { invoiceId, amountCents, currency },
      now,
    );
    return 'charged';
  }

  const nextRetryAt = now + retryDelayDays(attemptNo) * DAY_MS;
  const keepRetrying = row.grace_ends_at !== null && nextRetryAt < row.grace_ends_at;
  await markAttemptFailed(db, attempt.id, {
    errorCode: charge.errorCode ?? null,
    errorMessage: charge.errorMessage ?? null,
    nextRetryAt: keepRetrying ? nextRetryAt : null,
    raw: charge.raw ?? null,
  });
  await db.run(
    `UPDATE subscriptions SET status = 'past_due', updated_at = ?
      WHERE org_id = ? AND status = 'active'`,
    [now, row.org_id],
  );
  await notifyOwner(
    db,
    row.org_id,
    'billing_payment_failed',
    'No se pudo cobrar tu plan',
    keepRetrying
      ? 'El cobro fue rechazado. Lo reintentaremos antes de que termine tu período de tolerancia.'
      : 'El cobro fue rechazado y no quedan reintentos. Actualiza tu método de pago para evitar la suspensión.',
    { invoiceId, attemptId: attempt.id, amountCents, currency, errorCode: charge.errorCode ?? null },
    now,
  );
  return 'failed';
}

interface QuotedAmount {
  amountCents: number;
  currency: string;
}

export interface QuoteInput {
  subscriptionId: string;
  planKey: string;
  billingCycle: 'monthly' | 'yearly';
  currency: string;
  monthlyCents: number;
  yearlyCents: number;
}

/**
 * Importe real del próximo cobro: plan + módulos + complementos activos.
 * Usa el mismo motor de precios que la cotización pública; si el catálogo
 * cambió y no se puede cotizar, cae al precio del plan.
 */
export async function quoteSubscriptionAmount(db: Db, input: QuoteInput, now: number): Promise<QuotedAmount> {
  const fallback = input.billingCycle === 'yearly' ? input.yearlyCents : input.monthlyCents;

  try {
    const catalog = await loadPlanCatalog(db, input.planKey);
    const modules = await db.all<{ key: string }>(
      `SELECT m.key FROM subscription_modules sm
         JOIN modules m ON m.id = sm.module_id
        WHERE sm.subscription_id = ? AND sm.status = 'active' AND (sm.ends_at IS NULL OR sm.ends_at > ?)`,
      [input.subscriptionId, now],
    );
    const addons = await db.all<{ key: string; quantity: number }>(
      `SELECT a.key, sa.quantity FROM subscription_addons sa
         JOIN addons a ON a.id = sa.addon_id
        WHERE sa.subscription_id = ? AND sa.status = 'active' AND (sa.ends_at IS NULL OR sa.ends_at > ?)`,
      [input.subscriptionId, now],
    );
    const quote = quoteSubscription(catalog, {
      planKey: input.planKey,
      billingCycle: input.billingCycle,
      moduleKeys: modules.map((module) => module.key),
      addons,
    });
    return { amountCents: quote.totalCents, currency: quote.currency };
  } catch (error) {
    console.error(`[billing] cotización no disponible para ${input.planKey}, se usa el precio del plan:`, error);
    return { amountCents: fallback, currency: input.currency };
  }
}

async function notifyRenewal(
  db: Db,
  row: DueSubscription,
  periodStart: number,
  amountCents: number,
  currency: string,
  now: number,
): Promise<void> {
  const dueDate = new Date(periodStart).toISOString().slice(0, 10);
  await notifyOwner(
    db,
    row.org_id,
    'billing_renewal',
    'Tu plan está por renovarse',
    `La renovación de ${row.plan_name} es el ${dueDate} por ${formatAmount(amountCents, currency)}.`,
    { periodStart, amountCents, currency, invoice: true },
    now,
  );
}

async function notifyOwner(
  db: Db,
  orgId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  now: number,
): Promise<void> {
  const owner = await db.first<{ owner_user_id: string | null }>(
    `SELECT owner_user_id FROM organizations WHERE id = ?`,
    [orgId],
  );
  if (!owner?.owner_user_id) return;

  await db.run(
    `INSERT INTO notifications (id, org_id, user_id, type, title, body, channel, status, data_json, created_at, sent_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, 'in_app', 'sent', ?, ?, ?, NULL)`,
    [newId('ntf'), orgId, owner.owner_user_id, type, title, body, JSON.stringify(data), now, now],
  );
}

function formatAmount(amountCents: number, currency: string): string {
  const amount = (amountCents / 100).toFixed(2);
  return currency === 'USD' ? `USD ${amount}` : `${amount} ${currency}`;
}

export interface UpcomingCharge {
  orgId: string;
  orgName: string;
  planKey: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  dueAt: number;
  status: string;
  autoCharge: boolean;
}

/** Próximos cobros para el panel administrativo. */
export async function listUpcomingCharges(db: Db, now: number, days = 30, limit = 50): Promise<UpcomingCharge[]> {
  const rows = await db.all<{
    org_id: string;
    org_name: string;
    plan_key: string;
    plan_name: string;
    billing_cycle: 'monthly' | 'yearly';
    current_period_end: number;
    status: string;
    payment_method_id: string | null;
  }>(
    `SELECT s.org_id, o.name AS org_name, p.key AS plan_key, p.name AS plan_name, s.billing_cycle,
            s.current_period_end, s.status, s.payment_method_id
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       JOIN organizations o ON o.id = s.org_id
      WHERE s.status IN ('active', 'past_due')
        AND s.cancel_at_period_end = 0
        AND s.current_period_end <= ?
      ORDER BY s.current_period_end ASC
      LIMIT ?`,
    [now + days * DAY_MS, limit],
  );

  return rows.map((row) => ({
    orgId: row.org_id,
    orgName: row.org_name,
    planKey: row.plan_key,
    planName: row.plan_name,
    billingCycle: row.billing_cycle,
    dueAt: row.current_period_end,
    status: row.status,
    autoCharge: row.payment_method_id !== null,
  }));
}
