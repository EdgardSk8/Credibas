import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import {
  activateSubscriptionForPeriod,
  createBillingPayment,
  findBillingPaymentByProviderRef,
  getInvoice,
  getSubscription,
  markInvoicePaid,
  recordSubscriptionEvent,
} from '../repositories/subscriptions';
import { writeAudit } from '../repositories/audit';
import { newId } from '../lib/crypto';
import type { AppEnv } from '../types';

export const webhookRoutes = new Hono<AppEnv>();

function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  const clean = value.replace(/^sha256=/, '').trim();
  if (clean.length % 2 !== 0) throw new Error('Firma inválida');
  const buffer = new ArrayBuffer(clean.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function verifySignature(secret: string, body: string, signature: string | undefined): Promise<void> {
  if (!signature) throw AppError.unauthorized('Falta la firma del webhook');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    hexToBytes(signature),
    new TextEncoder().encode(body),
  );

  if (!valid) throw AppError.unauthorized('Firma del webhook inválida');
}

interface BillingWebhookPayload {
  event: string;
  providerRef: string;
  orgId: string;
  invoiceId?: string | null;
  amountCents?: number;
  currency?: string;
}

webhookRoutes.post('/billing/:provider', async (c) => {
  const secret = c.env.BILLING_WEBHOOK_SECRET;
  if (!secret) throw new AppError('webhook_not_configured', 503, 'El webhook no está configurado');

  const body = await c.req.text();
  const signature = c.req.header('x-credibas-signature');
  await verifySignature(secret, body, signature);

  let payload: BillingWebhookPayload;
  try {
    payload = JSON.parse(body) as BillingWebhookPayload;
  } catch {
    throw AppError.badRequest('Payload inválido');
  }

  if (!payload.event || !payload.providerRef || !payload.orgId) {
    throw AppError.badRequest('Payload incompleto');
  }

  const provider = c.req.param('provider');
  const db = dbFrom(c.env.DB);
  const now = Date.now();

  // Idempotencia: un mismo providerRef nunca se procesa dos veces.
  const existing = await findBillingPaymentByProviderRef(db, provider, payload.providerRef);
  if (existing) return c.json({ ok: true, duplicated: true });

  if (payload.event !== 'payment.succeeded') {
    return c.json({ ok: true, ignored: true });
  }

  const subscription = await getSubscription(db, payload.orgId);
  if (!subscription) throw AppError.notFound('Suscripción no encontrada');

  const invoice = payload.invoiceId ? await getInvoice(db, payload.orgId, payload.invoiceId) : null;
  const amount = payload.amountCents ?? invoice?.amount_cents ?? 0;
  const currency = payload.currency ?? invoice?.currency ?? subscription.plan.currency;

  const billingPaymentId = await createBillingPayment(
    db,
    {
      orgId: payload.orgId,
      invoiceId: payload.invoiceId ?? null,
      provider,
      providerRef: payload.providerRef,
      amountCents: amount,
      currency,
      status: 'confirmed',
      raw: payload,
    },
    now,
  );

  if (payload.invoiceId) await markInvoicePaid(db, payload.orgId, payload.invoiceId, now);

  await activateSubscriptionForPeriod(
    db,
    { orgId: payload.orgId, planId: subscription.plan.id, billingCycle: subscription.billing_cycle },
    now,
  );

  await recordSubscriptionEvent(
    db,
    { orgId: payload.orgId, subscriptionId: subscription.id, type: 'webhook.payment_confirmed', data: { provider, providerRef: payload.providerRef, amount }, actorUserId: null },
    now,
  );

  await writeAudit(
    db,
    {
      orgId: payload.orgId,
      actorUserId: null,
      action: 'billing.webhook_confirmed',
      entityType: 'billing_payment',
      entityId: billingPaymentId,
      after: { provider, providerRef: payload.providerRef, amount },
      ip: c.get('clientIp'),
    },
    now,
  );

  void newId;
  return c.json({ ok: true });
});
