import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { parseBody } from '../middleware/core';
import { hitRateLimit } from '../repositories/rate-limits';
import { getPlanLimits, listPublicPlans } from '../repositories/subscriptions';
import { sendEmail } from '../services/mailer';
import { verifyTurnstile } from '../services/turnstile';
import { publicContactSchema } from '../../shared/validation';
import { mapPlan } from './mappers';
import type { AppEnv } from '../types';

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'credibas-api',
    environment: c.env.APP_ENV,
    time: new Date().toISOString(),
  }),
);

publicRoutes.get('/plans', async (c) => {
  const db = dbFrom(c.env.DB);
  const plans = await listPublicPlans(db);
  const items = await Promise.all(
    plans.map(async (plan) => mapPlan(plan, await getPlanLimits(db, plan.id))),
  );
  return c.json({ items });
});

publicRoutes.get('/exchange-rate', async (c) => {
  const db = dbFrom(c.env.DB);
  const row = await db.first<{ rate_micros: number; effective_date: string; base_currency: string; quote_currency: string }>(
    `SELECT rate_micros, effective_date, base_currency, quote_currency
       FROM exchange_rates ORDER BY effective_date DESC LIMIT 1`,
  );
  if (!row) return c.json({ rate: null });
  return c.json({
    rate: {
      base: row.base_currency,
      quote: row.quote_currency,
      value: row.rate_micros / 1_000_000,
      effectiveDate: row.effective_date,
    },
  });
});

publicRoutes.post('/contact', async (c) => {
  const db = dbFrom(c.env.DB);
  const now = Date.now();
  const input = await parseBody(c, publicContactSchema);

  await verifyTurnstile(c.env, input.turnstileToken, c.get('clientIp'));
  const limit = await hitRateLimit(db, `contact:${c.get('clientIp')}`, 3, 60 * 60 * 1000, now);
  if (!limit.allowed) throw AppError.tooMany('Ya recibimos tu mensaje. Te respondemos pronto.');

  const to = c.env.EMAIL_FROM ?? 'hola@credibas.app';
  await sendEmail(c.env, {
    to,
    subject: `Contacto desde credibas.app · ${input.name}`,
    text: `Nombre: ${input.name}\nCorreo: ${input.email}\nNegocio: ${input.company ?? '-'}\n\n${input.message}`,
    html: `<p><strong>Nombre:</strong> ${input.name}</p><p><strong>Correo:</strong> ${input.email}</p><p><strong>Negocio:</strong> ${input.company ?? '-'}</p><p>${input.message.replace(/\n/g, '<br />')}</p>`,
  });

  return c.json({ ok: true, message: 'Mensaje recibido. Te responderemos en menos de 24 horas hábiles.' });
});
