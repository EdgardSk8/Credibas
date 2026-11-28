import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { dbFrom } from '../db';
import { hashToken } from '../lib/crypto';
import { findSessionByTokenHash, SESSION_COOKIE, touchSession } from '../repositories/sessions';
import { getMembershipContext } from '../repositories/organizations';
import type { AppEnv } from '../types';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Resuelve la sesión desde la cookie HttpOnly. La organización activa sale
 * siempre de la sesión/membresía autenticada, nunca de un header del cliente.
 */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const db = dbFrom(c.env.DB);
  const now = Date.now();
  const token = getCookie(c, SESSION_COOKIE);

  if (token) {
    const session = await findSessionByTokenHash(db, await hashToken(token));
    const valid =
      session !== null &&
      session.revoked_at === null &&
      session.expires_at > now &&
      session.user_status === 'active';

    if (valid) {
      c.set('userId', session.user_id);
      c.set('sessionId', session.id);
      c.set('sessionOrgId', session.org_id);
      c.set('userEmail', session.email);
      c.set('userFullName', session.full_name);
      c.set('emailVerified', session.email_verified_at !== null);
      c.set('isPlatformAdmin', session.is_platform_admin === 1);
      c.set('isDemo', session.is_demo === 1);

      if (now - session.last_used_at > TOUCH_INTERVAL_MS) {
        await touchSession(db, session.id, now);
      }
    }
  }

  await next();
});

/**
 * Resuelve la organización activa validando la membresía del usuario.
 * Si la organización guardada ya no es válida, usa la primera membresía activa.
 */
export const organizationMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get('userId');
  if (!userId) {
    await next();
    return;
  }

  const db = dbFrom(c.env.DB);
  const preferred = c.get('sessionOrgId');

  let context = preferred ? await getMembershipContext(db, userId, preferred) : null;

  if (!context) {
    const first = await db.first<{ org_id: string }>(
      `SELECT org_id FROM organization_members WHERE user_id = ? AND status = 'active' ORDER BY created_at ASC LIMIT 1`,
      [userId],
    );
    if (first) context = await getMembershipContext(db, userId, first.org_id);
  }

  if (context && context.org.status === 'active') {
    c.set('orgId', context.org.id);
    c.set('orgName', context.org.name);
    c.set('orgCurrency', context.org.currency);
    c.set('orgTimezone', context.org.timezone);
    c.set('memberId', context.memberId);
    c.set('roleKey', context.roleKey);
    c.set('permissions', context.permissions);
  }

  await next();
});
