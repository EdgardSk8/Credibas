import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { hashToken } from '../lib/crypto';
import { setSessionCookie } from '../lib/session-cookie';
import { parseBody } from '../middleware/core';
import { requireAuth, requireVerifiedEmail } from '../middleware/guards';
import {
  SESSION_COOKIE,
  listUserSessions,
  revokeOtherSessions,
  revokeSession,
  setSessionOrg,
} from '../repositories/sessions';
import { getMembershipContext, listMembershipsForUser } from '../repositories/organizations';
import { findUserById } from '../repositories/users';
import { acceptInvitation, findInvitationByTokenHash } from '../repositories/members';
import { writeAudit } from '../repositories/audit';
import {
  authenticate,
  changePassword,
  registerAccount,
  requestPasswordReset,
  resendVerificationEmail,
  resetPasswordWithToken,
  verifyEmailCode,
} from '../services/auth-service';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailCodeSchema,
} from '../../shared/validation';
import type { MeResponse, MembershipSummary } from '../../shared/types';
import type { AppEnv } from '../types';

export const authRoutes = new Hono<AppEnv>();

function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

function requestMeta(c: Context<AppEnv>) {
  return { ip: c.get('clientIp'), userAgent: c.req.header('user-agent') ?? 'unknown' };
}

export async function buildMeResponse(c: Context<AppEnv>): Promise<MeResponse | null> {
  const userId = c.get('userId');
  if (!userId) return null;

  const db = dbFrom(c.env.DB);
  const user = await findUserById(db, userId);
  if (!user) return null;

  const memberships = await listMembershipsForUser(db, userId);
  const activeOrgId = c.get('orgId');

  const mapped: MembershipSummary[] = memberships.map((item) => ({
    orgId: item.orgId,
    memberId: item.memberId,
    orgName: item.orgName,
    orgSlug: item.orgSlug,
    currency: item.currency,
    timezone: item.timezone,
    role: item.roleKey as MembershipSummary['role'],
    roleName: item.roleName,
    permissions: item.orgId === activeOrgId ? ((c.get('permissions') ?? []) as MembershipSummary['permissions']) : [],
    subscriptionStatus: item.subscriptionStatus,
  }));

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      emailVerified: user.email_verified_at !== null,
      isPlatformAdmin: user.is_platform_admin === 1,
      createdAt: new Date(user.created_at).toISOString(),
    },
    memberships: mapped,
    activeOrgId,
    onboardingComplete: memberships.length > 0,
    isDemo: c.get('isDemo'),
  };
}

authRoutes.post('/register', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, registerSchema);
  const now = Date.now();

  await registerAccount(c.env, db, input, requestMeta(c), now);

  return c.json(
    {
      ok: true,
      message: 'Cuenta creada. Enviamos un código de 6 dígitos a tu correo para confirmarla.',
    },
    201,
  );
});

authRoutes.post('/login', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, loginSchema);
  const now = Date.now();

  const { token } = await authenticate(c.env, db, input, requestMeta(c), now);
  setSessionCookie(c, token);

  return c.json({ ok: true });
});

authRoutes.post('/logout', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.get('sessionId');
  const db = dbFrom(c.env.DB);

  if (userId && sessionId) {
    await revokeSession(db, sessionId, userId, Date.now());
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', async (c) => {
  const me = await buildMeResponse(c);
  if (!me) throw AppError.unauthorized();
  return c.json(me);
});

authRoutes.post('/verify-email-code', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, verifyEmailCodeSchema);
  await verifyEmailCode(db, input.email, input.code, requestMeta(c), Date.now());
  return c.json({ ok: true, message: 'Correo confirmado. Ya puedes iniciar sesión.' });
});

authRoutes.post('/resend-verification', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, resendVerificationSchema);
  await resendVerificationEmail(c.env, db, input.email, requestMeta(c), Date.now());
  return c.json({ ok: true, message: 'Si el correo necesita confirmación, enviamos un nuevo código.' });
});

authRoutes.post('/forgot-password', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, forgotPasswordSchema);
  await requestPasswordReset(c.env, db, input.email, requestMeta(c), Date.now());
  return c.json({
    ok: true,
    message: 'Si el correo existe, enviamos instrucciones para restablecer la contraseña.',
  });
});

authRoutes.post('/reset-password', async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, resetPasswordSchema);
  await resetPasswordWithToken(c.env, db, input.token, input.password, requestMeta(c), Date.now());
  clearSessionCookie(c);
  return c.json({ ok: true, message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' });
});

authRoutes.post('/change-password', requireAuth, async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, changePasswordSchema);
  await changePassword(
    c.env,
    db,
    c.get('userId') as string,
    c.get('sessionId') as string,
    input,
    requestMeta(c),
    Date.now(),
  );
  return c.json({ ok: true, message: 'Contraseña actualizada.' });
});

authRoutes.get('/sessions', requireAuth, async (c) => {
  const db = dbFrom(c.env.DB);
  const sessions = await listUserSessions(db, c.get('userId') as string, Date.now());
  return c.json({
    items: sessions.map((session) => ({
      id: session.id,
      current: session.id === c.get('sessionId'),
      ip: session.ip,
      userAgent: session.user_agent,
      createdAt: new Date(session.created_at).toISOString(),
      lastUsedAt: new Date(session.last_used_at).toISOString(),
      expiresAt: new Date(session.expires_at).toISOString(),
    })),
  });
});

authRoutes.delete('/sessions/:id', requireAuth, async (c) => {
  const db = dbFrom(c.env.DB);
  await revokeSession(db, c.req.param('id'), c.get('userId') as string, Date.now());
  return c.json({ ok: true });
});

authRoutes.post('/sessions/revoke-others', requireAuth, async (c) => {
  const db = dbFrom(c.env.DB);
  await revokeOtherSessions(db, c.get('userId') as string, c.get('sessionId') as string, Date.now());
  return c.json({ ok: true });
});

authRoutes.post('/switch-org', requireAuth, requireVerifiedEmail, async (c) => {
  const db = dbFrom(c.env.DB);
  const body = await c.req.json<{ orgId?: string }>();
  if (!body.orgId) throw AppError.badRequest('Falta la organización');

  const context = await getMembershipContext(db, c.get('userId') as string, body.orgId);
  if (!context) throw AppError.notFound('No perteneces a esa organización');

  await setSessionOrg(db, c.get('sessionId') as string, c.get('userId') as string, body.orgId);
  return c.json({ ok: true });
});

authRoutes.get('/invitations/:token', async (c) => {
  const db = dbFrom(c.env.DB);
  const invitation = await findInvitationByTokenHash(db, await hashToken(c.req.param('token')));
  if (!invitation || invitation.accepted_at || invitation.expires_at < Date.now()) {
    throw AppError.badRequest('La invitación es inválida o expiró');
  }
  const org = await db.first<{ name: string }>(`SELECT name FROM organizations WHERE id = ?`, [invitation.org_id]);
  return c.json({ orgName: org?.name ?? '', email: invitation.email });
});

authRoutes.post('/accept-invitation', requireAuth, requireVerifiedEmail, async (c) => {
  const db = dbFrom(c.env.DB);
  const body = await c.req.json<{ token?: string }>();
  if (!body.token) throw AppError.badRequest('Falta el token de la invitación');

  const invitation = await findInvitationByTokenHash(db, await hashToken(body.token));
  if (!invitation || invitation.accepted_at || invitation.expires_at < Date.now()) {
    throw AppError.badRequest('La invitación es inválida o expiró');
  }

  const user = await findUserById(db, c.get('userId') as string);
  if (!user) throw AppError.unauthorized();
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw AppError.forbidden('Esta invitación fue enviada a otro correo');
  }

  await acceptInvitation(
    db,
    { invitationId: invitation.id, orgId: invitation.org_id, userId: user.id, roleId: invitation.role_id },
    Date.now(),
  );

  await setSessionOrg(db, c.get('sessionId') as string, user.id, invitation.org_id);
  await writeAudit(
    db,
    {
      orgId: invitation.org_id,
      actorUserId: user.id,
      action: 'member.invitation_accepted',
      entityType: 'organization_member',
      entityId: user.id,
      ip: c.get('clientIp'),
      userAgent: c.req.header('user-agent') ?? null,
    },
    Date.now(),
  );

  return c.json({ ok: true, orgId: invitation.org_id });
});
