import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { parseBody } from '../middleware/core';
import { hitRateLimit } from '../repositories/rate-limits';
import { createSession } from '../repositories/sessions';
import { hashToken, randomToken } from '../lib/crypto';
import { setSessionCookie } from '../lib/session-cookie';
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

publicRoutes.get('/config', (c) =>
  c.json({
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
  }),
);

/** Organización que se muestra en la demo pública (sembrada por `npm run db:seed:demo`). */
const DEMO_ORG_SLUG = 'financiera-demo';
const DEMO_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Abre una sesión de demo sin credenciales. Es de solo lectura: el middleware
 * `blockDemoWrites` rechaza cualquier escritura y la sesión no entra al panel
 * de plataforma. Usa un miembro sin privilegios de plataforma a propósito.
 */
publicRoutes.post('/demo', async (c) => {
  const db = dbFrom(c.env.DB);
  const now = Date.now();

  const limit = await hitRateLimit(db, `demo:${c.get('clientIp')}`, 20, 10 * 60 * 1000, now);
  if (!limit.allowed) {
    throw new AppError('rate_limited', 429, 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.');
  }

  const demo = await db.first<{ user_id: string; org_id: string }>(
    `SELECT m.user_id, o.id AS org_id
       FROM organizations o
       JOIN organization_members m ON m.org_id = o.id AND m.status = 'active'
       JOIN users u ON u.id = m.user_id
      WHERE o.slug = ? AND o.status = 'active' AND u.status = 'active' AND u.is_platform_admin = 0
      ORDER BY (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = m.role_id) DESC, m.created_at ASC
      LIMIT 1`,
    [DEMO_ORG_SLUG],
  );
  if (!demo) {
    throw new AppError('demo_unavailable', 404, 'La demo no está disponible en este momento.');
  }

  const token = randomToken();
  await createSession(
    db,
    {
      userId: demo.user_id,
      orgId: demo.org_id,
      tokenHash: await hashToken(token),
      ip: c.get('clientIp'),
      userAgent: c.req.header('user-agent') ?? 'unknown',
      isDemo: true,
      ttlMs: DEMO_SESSION_TTL_MS,
    },
    now,
  );

  setSessionCookie(c, token, DEMO_SESSION_TTL_MS);
  return c.json({ ok: true, redirect: '/app' });
});

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

  const to = c.env.EMAIL_FROM ?? 'tellezsoftware@gmail.com';
  await sendEmail(c.env, {
    to,
    subject: `Contacto desde Credibas · ${input.name}`,
    text: `Nombre: ${input.name}\nCorreo: ${input.email}\nNegocio: ${input.company ?? '-'}\n\n${input.message}`,
    html: `<p><strong>Nombre:</strong> ${input.name}</p><p><strong>Correo:</strong> ${input.email}</p><p><strong>Negocio:</strong> ${input.company ?? '-'}</p><p>${input.message.replace(/\n/g, '<br />')}</p>`,
  });

  return c.json({ ok: true, message: 'Mensaje recibido. Te responderemos en menos de 24 horas hábiles.' });
});
