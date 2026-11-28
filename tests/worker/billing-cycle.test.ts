import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { dbFrom } from '../../src/worker/db';
import { refreshExpiredSubscriptions } from '../../src/worker/repositories/subscriptions';
import { createPaymentMethod } from '../../src/worker/repositories/payment-methods';
import { retryDelayDays, runBillingCycle } from '../../src/worker/services/billing-cycle';
import type { PaymentProvider } from '../../src/worker/services/payments';
import type { Env } from '../../src/worker/env';

const db = () => dbFrom((env as unknown as Env).DB);
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

function fakeProvider(result: 'succeeded' | 'failed'): PaymentProvider {
  return {
    key: 'fake',
    supportsRecurring: true,
    async charge(request) {
      return result === 'succeeded'
        ? { status: 'succeeded', providerRef: `tx-${request.idempotencyKey}`, raw: { ok: true } }
        : { status: 'failed', providerRef: null, errorCode: 'declined', errorMessage: 'Tarjeta rechazada' };
    },
    async getCharge() {
      return { status: 'failed', providerRef: null, errorCode: 'not_found', errorMessage: 'Sin transacción' };
    },
  };
}

interface SeedOptions {
  orgId: string;
  periodEnd: number;
  status?: string;
  planKey?: string;
  graceEndsAt?: number | null;
}

async function seedSubscription(options: SeedOptions): Promise<{ subscriptionId: string; userId: string }> {
  const database = db();
  const userId = `usr_${options.orgId}`;
  const plan = await database.first<{ id: string }>(`SELECT id FROM plans WHERE key = ?`, [
    options.planKey ?? 'starter',
  ]);
  if (!plan) throw new Error('Plan no encontrado en la semilla');

  await database.run(
    `INSERT INTO users (id, email, full_name, password_hash, password_salt, password_iterations, status, created_at, updated_at)
     VALUES (?, ?, 'Prueba', 'x', 'y', 1, 'active', ?, ?)`,
    [userId, `${options.orgId}@test.local`, NOW, NOW],
  );
  await database.run(
    `INSERT INTO organizations (id, name, slug, owner_user_id, currency, status, created_at, updated_at)
     VALUES (?, 'Org de prueba', ?, ?, 'USD', 'active', ?, ?)`,
    [options.orgId, options.orgId, userId, NOW, NOW],
  );

  const subscriptionId = `sub_${options.orgId}`;
  await database.run(
    `INSERT INTO subscriptions (id, org_id, plan_id, status, billing_cycle, current_period_start, current_period_end,
       grace_ends_at, cancel_at_period_end, payment_method_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'monthly', ?, ?, ?, 0, NULL, ?, ?)`,
    [
      subscriptionId,
      options.orgId,
      plan.id,
      options.status ?? 'active',
      options.periodEnd - 30 * DAY,
      options.periodEnd,
      options.graceEndsAt === undefined ? options.periodEnd + 7 * DAY : options.graceEndsAt,
      NOW,
      NOW,
    ],
  );

  return { subscriptionId, userId };
}

describe('motor de cobro recurrente', () => {
  it('aplica la espera progresiva de reintentos', () => {
    expect(retryDelayDays(1)).toBe(1);
    expect(retryDelayDays(2)).toBe(3);
    expect(retryDelayDays(3)).toBe(5);
    expect(retryDelayDays(9)).toBe(5);
  });

  it('emite factura y aviso sin cobrar cuando el proveedor es manual', async () => {
    const periodEnd = NOW + DAY;
    const { subscriptionId } = await seedSubscription({ orgId: 'org_manual', periodEnd });

    const result = await runBillingCycle(env as unknown as Env, NOW);
    const database = db();

    expect(result.awaitingPayment).toBe(1);
    expect(result.charged).toBe(0);

    const invoice = await database.first<{ id: string; status: string; amount_cents: number }>(
      `SELECT id, status, amount_cents FROM invoices WHERE subscription_id = ?`,
      [subscriptionId],
    );
    expect(invoice?.status).toBe('open');
    expect(invoice?.amount_cents).toBe(990);

    const notification = await database.first<{ type: string }>(
      `SELECT type FROM notifications WHERE org_id = 'org_manual'`,
    );
    expect(notification?.type).toBe('billing_renewal');

    const attempts = await database.count(`SELECT COUNT(*) AS total FROM billing_payments WHERE org_id = 'org_manual'`);
    expect(attempts).toBe(0);
  });

  it('no duplica la factura al ejecutar el ciclo otra vez', async () => {
    const { subscriptionId } = await seedSubscription({ orgId: 'org_repetido', periodEnd: NOW + DAY });

    await runBillingCycle(env as unknown as Env, NOW);
    await runBillingCycle(env as unknown as Env, NOW);

    const database = db();
    const invoices = await database.count(`SELECT COUNT(*) AS total FROM invoices WHERE subscription_id = ?`, [
      subscriptionId,
    ]);
    const notifications = await database.count(
      `SELECT COUNT(*) AS total FROM notifications WHERE org_id = 'org_repetido'`,
    );

    expect(invoices).toBe(1);
    expect(notifications).toBe(1);
  });

  it('ignora el plan gratuito', async () => {
    const { subscriptionId } = await seedSubscription({
      orgId: 'org_gratis',
      periodEnd: NOW + DAY,
      planKey: 'trial',
    });

    const result = await runBillingCycle(env as unknown as Env, NOW);
    const invoices = await db().count(`SELECT COUNT(*) AS total FROM invoices WHERE subscription_id = ?`, [
      subscriptionId,
    ]);

    expect(result.skipped).toBe(1);
    expect(invoices).toBe(0);
  });

  it('cobra, marca la factura pagada y extiende el período', async () => {
    const database = db();
    const periodEnd = NOW + DAY;
    const { subscriptionId } = await seedSubscription({ orgId: 'org_cobro', periodEnd });

    const methodId = await createPaymentMethod(
      database,
      {
        orgId: 'org_cobro',
        provider: 'fake',
        providerTokenRef: 'tok_cobro',
        authorizationRef: 'auth_cobro',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        holderName: 'Prueba',
      },
      NOW,
    );
    await database.run(`UPDATE subscriptions SET payment_method_id = ? WHERE id = ?`, [methodId, subscriptionId]);

    const result = await runBillingCycle(env as unknown as Env, NOW, { provider: fakeProvider('succeeded') });

    expect(result.charged).toBe(1);

    const invoice = await database.first<{ status: string }>(
      `SELECT status FROM invoices WHERE subscription_id = ?`,
      [subscriptionId],
    );
    expect(invoice?.status).toBe('paid');

    const subscription = await database.first<{ status: string; current_period_end: number }>(
      `SELECT status, current_period_end FROM subscriptions WHERE id = ?`,
      [subscriptionId],
    );
    expect(subscription?.status).toBe('active');
    expect(Number(subscription?.current_period_end)).toBe(periodEnd + 30 * DAY);

    const attempt = await database.first<{ status: string; provider_ref: string }>(
      `SELECT status, provider_ref FROM billing_payments WHERE org_id = 'org_cobro'`,
    );
    expect(attempt?.status).toBe('confirmed');
    expect(attempt?.provider_ref).toBeTruthy();

    // Un segundo ciclo no vuelve a cobrar el mismo período.
    await runBillingCycle(env as unknown as Env, NOW, { provider: fakeProvider('succeeded') });
    const attempts = await database.count(`SELECT COUNT(*) AS total FROM billing_payments WHERE org_id = 'org_cobro'`);
    expect(attempts).toBe(1);
  });

  it('deja la suscripción en tolerancia y programa el reintento cuando el cobro falla', async () => {
    const database = db();
    const { subscriptionId } = await seedSubscription({ orgId: 'org_fallo', periodEnd: NOW + DAY });

    const methodId = await createPaymentMethod(
      database,
      {
        orgId: 'org_fallo',
        provider: 'fake',
        providerTokenRef: 'tok_fallo',
        authorizationRef: null,
        brand: 'mastercard',
        last4: '0002',
        expMonth: 1,
        expYear: 2031,
        holderName: 'Prueba',
      },
      NOW,
    );
    await database.run(`UPDATE subscriptions SET payment_method_id = ? WHERE id = ?`, [methodId, subscriptionId]);

    const result = await runBillingCycle(env as unknown as Env, NOW, { provider: fakeProvider('failed') });

    expect(result.failed).toBe(1);

    const subscription = await database.first<{ status: string }>(
      `SELECT status FROM subscriptions WHERE id = ?`,
      [subscriptionId],
    );
    expect(subscription?.status).toBe('past_due');

    const attempt = await database.first<{ status: string; next_retry_at: number; error_code: string }>(
      `SELECT status, next_retry_at, error_code FROM billing_payments WHERE org_id = 'org_fallo'`,
    );
    expect(attempt?.status).toBe('failed');
    expect(attempt?.error_code).toBe('declined');
    expect(Number(attempt?.next_retry_at)).toBe(NOW + DAY);

    // El mismo ciclo no reintenta antes de la fecha programada.
    await runBillingCycle(env as unknown as Env, NOW, { provider: fakeProvider('failed') });
    const attempts = await database.count(`SELECT COUNT(*) AS total FROM billing_payments WHERE org_id = 'org_fallo'`);
    expect(attempts).toBe(1);
  });

  it('expira las suscripciones vencidas incluso si quedaron en tolerancia', async () => {
    const database = db();
    const { subscriptionId } = await seedSubscription({
      orgId: 'org_vencida',
      periodEnd: NOW - 10 * DAY,
      status: 'past_due',
      graceEndsAt: NOW - DAY,
    });

    const changed = await refreshExpiredSubscriptions(database, NOW);
    const subscription = await database.first<{ status: string }>(
      `SELECT status FROM subscriptions WHERE id = ?`,
      [subscriptionId],
    );

    expect(changed).toBeGreaterThanOrEqual(1);
    expect(subscription?.status).toBe('expired');
  });
});
