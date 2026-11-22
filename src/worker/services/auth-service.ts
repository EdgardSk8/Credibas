import type { Db } from '../db';
import type { Env } from '../env';
import { AppError } from '../lib/errors';
import { hashPassword, resolvePasswordIterations, verifyPassword } from '../lib/passwords';
import { hashToken, randomToken, timingSafeEqual } from '../lib/crypto';
import { createUser, findUserByEmail, findUserById, markEmailVerified, touchLastLogin, updateUserPassword } from '../repositories/users';
import { createSession, revokeAllSessions, revokeOtherSessions, setSessionOrg } from '../repositories/sessions';
import {
  consumePasswordReset,
  createPasswordReset,
  deleteVerificationCode,
  findVerificationCode,
  issueVerificationCode,
  recordVerificationAttempt,
} from '../repositories/tokens';
import { countRecentFailedAttempts, hitRateLimit, recordLoginAttempt } from '../repositories/rate-limits';
import { createOrganization } from '../repositories/organizations';
import { getPlanByKey } from '../repositories/subscriptions';
import { writeAudit } from '../repositories/audit';
import { verifyTurnstile } from './turnstile';
import { sendEmail } from './mailer';
import { invitationEmail, passwordResetEmail, verificationCodeEmail } from './emails';
import type { createOrganizationSchema } from '../../shared/validation';
import type { z } from 'zod';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

function appUrl(env: Env): string {
  return (env.APP_URL ?? 'https://credibas.app').replace(/\/+$/, '');
}

async function enforceRateLimit(db: Db, key: string, limit: number, windowMs: number, now: number): Promise<void> {
  const result = await hitRateLimit(db, key, limit, windowMs, now);
  if (!result.allowed) throw AppError.tooMany();
}

export async function registerAccount(
  env: Env,
  db: Db,
  input: { fullName: string; email: string; password: string; turnstileToken?: string },
  meta: RequestMeta,
  now: number,
): Promise<{ userId: string }> {
  await verifyTurnstile(env, input.turnstileToken, meta.ip);
  await enforceRateLimit(db, `register:${meta.ip}`, 5, ONE_HOUR, now);

  const existing = await findUserByEmail(db, input.email);
  if (existing) {
    throw AppError.conflict('Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.');
  }

  const iterations = resolvePasswordIterations(env.PASSWORD_ITERATIONS);
  const password = await hashPassword(input.password, iterations);
  const userId = await createUser(
    db,
    {
      email: input.email,
      fullName: input.fullName,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      passwordIterations: password.iterations,
    },
    now,
  );

  await writeAudit(
    db,
    {
      orgId: null,
      actorUserId: userId,
      action: 'auth.registered',
      entityType: 'user',
      entityId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    now,
  );

  await issueEmailVerification(env, db, { id: userId, email: input.email, fullName: input.fullName }, now);
  return { userId };
}

function generateVerificationCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  const value = buffer[0] ?? 0;
  return String(value % 1_000_000).padStart(6, '0');
}

function hashVerificationCode(userId: string, code: string): Promise<string> {
  return hashToken(`${userId}:${code}`);
}

/**
 * Genera y envía un código de 6 dígitos. Si el canal de correo falla, el
 * registro no se bloquea: el usuario puede solicitar un reenvío.
 */
export async function issueEmailVerification(
  env: Env,
  db: Db,
  user: { id: string; email: string; fullName: string },
  now: number,
): Promise<void> {
  const code = generateVerificationCode();
  const issued = await issueVerificationCode(db, user.id, await hashVerificationCode(user.id, code), now);
  if (issued.status === 'cooldown') {
    throw AppError.tooMany('Espera un minuto antes de solicitar otro código.');
  }
  if (issued.status === 'limit') {
    throw AppError.tooMany('Solicitaste demasiados códigos. Intenta de nuevo en una hora.');
  }

  const message = verificationCodeEmail(user.fullName, code);
  try {
    await sendEmail(env, { to: user.email, subject: message.subject, text: message.text, html: message.html });
  } catch (error) {
    console.error(
      `[auth] No se pudo enviar el código de verificación: ${error instanceof Error ? error.message : 'error desconocido'}`,
    );
  }
}

/** Reenvía el código sin revelar si el correo existe. */
export async function resendVerificationEmail(
  env: Env,
  db: Db,
  email: string,
  meta: RequestMeta,
  now: number,
): Promise<void> {
  await enforceRateLimit(db, `resend-verification:${meta.ip}`, 10, ONE_HOUR, now);
  const user = await findUserByEmail(db, email);
  if (!user || user.email_verified_at) return;
  await issueEmailVerification(env, db, { id: user.id, email: user.email, fullName: user.full_name }, now);
}

export async function verifyEmailCode(
  db: Db,
  email: string,
  code: string,
  meta: RequestMeta,
  now: number,
): Promise<void> {
  await enforceRateLimit(db, `verify-code:${meta.ip}`, 10, FIFTEEN_MINUTES, now);

  const invalidCode = () => AppError.badRequest('El código es inválido o expiró. Solicita uno nuevo.');
  const user = await findUserByEmail(db, email);
  if (!user || user.email_verified_at) throw invalidCode();

  const row = await findVerificationCode(db, user.id);
  if (!row) throw invalidCode();
  if (row.expires_at <= now) {
    await deleteVerificationCode(db, user.id);
    throw invalidCode();
  }
  if (row.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    await deleteVerificationCode(db, user.id);
    throw AppError.tooMany('Demasiados intentos con este código. Solicita uno nuevo.');
  }

  const candidate = await hashVerificationCode(user.id, code);
  if (!timingSafeEqual(row.code_hash, candidate)) {
    await recordVerificationAttempt(db, user.id);
    throw invalidCode();
  }

  await markEmailVerified(db, user.id, now);
  await deleteVerificationCode(db, user.id);
  await writeAudit(
    db,
    {
      orgId: null,
      actorUserId: user.id,
      action: 'auth.email_verified',
      entityType: 'user',
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    now,
  );
}

export async function authenticate(
  env: Env,
  db: Db,
  input: { email: string; password: string; turnstileToken?: string },
  meta: RequestMeta,
  now: number,
): Promise<{ token: string; userId: string }> {
  await verifyTurnstile(env, input.turnstileToken, meta.ip);
  await enforceRateLimit(db, `login:${meta.ip}:${input.email}`, 10, FIFTEEN_MINUTES, now);

  const failures = await countRecentFailedAttempts(db, input.email, meta.ip, now - FIFTEEN_MINUTES);
  if (failures >= 5) {
    throw AppError.tooMany('Demasiados intentos fallidos. Espera 15 minutos o recupera tu contraseña.');
  }

  const user = await findUserByEmail(db, input.email);
  if (!user) {
    await recordLoginAttempt(db, { identifier: input.email, ip: meta.ip, success: false }, now);
    throw AppError.unauthorized('Correo o contraseña incorrectos');
  }

  const valid = await verifyPassword(input.password, {
    hash: user.password_hash,
    salt: user.password_salt,
    iterations: user.password_iterations,
  });

  if (!valid) {
    await recordLoginAttempt(db, { identifier: input.email, ip: meta.ip, success: false }, now);
    throw AppError.unauthorized('Correo o contraseña incorrectos');
  }

  if (user.status === 'blocked') throw AppError.forbidden('Tu cuenta está bloqueada. Contacta a soporte.');
  if (user.status === 'deleted') throw AppError.unauthorized('Correo o contraseña incorrectos');

  if (!user.email_verified_at) {
    throw new AppError(
      'email_not_verified',
      403,
      'Confirma tu correo antes de ingresar. Revisa el código que enviamos a tu bandeja de entrada.',
    );
  }

  const token = randomToken();
  const sessionId = await createSession(
    db,
    { userId: user.id, orgId: null, tokenHash: await hashToken(token), ip: meta.ip, userAgent: meta.userAgent },
    now,
  );

  await recordLoginAttempt(db, { identifier: input.email, ip: meta.ip, success: true }, now);
  await touchLastLogin(db, user.id, now);

  const membership = await db.first<{ org_id: string }>(
    `SELECT org_id FROM organization_members WHERE user_id = ? AND status = 'active' ORDER BY created_at ASC LIMIT 1`,
    [user.id],
  );
  if (membership) await setSessionOrg(db, sessionId, user.id, membership.org_id);

  return { token, userId: user.id };
}

export async function requestPasswordReset(
  env: Env,
  db: Db,
  email: string,
  meta: RequestMeta,
  now: number,
): Promise<void> {
  await enforceRateLimit(db, `forgot:${meta.ip}`, 5, ONE_HOUR, now);
  const user = await findUserByEmail(db, email);
  if (!user) return; // No revelamos si el correo existe.

  const token = randomToken();
  await createPasswordReset(db, user.id, await hashToken(token), now);
  const url = `${appUrl(env)}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
  const message = passwordResetEmail(user.full_name, url);
  await sendEmail(env, { to: user.email, subject: message.subject, text: message.text, html: message.html });
}

export async function resetPasswordWithToken(
  env: Env,
  db: Db,
  token: string,
  newPassword: string,
  meta: RequestMeta,
  now: number,
): Promise<void> {
  const userId = await consumePasswordReset(db, await hashToken(token), now);
  if (!userId) throw AppError.badRequest('El enlace es inválido o expiró. Solicita uno nuevo.');

  const password = await hashPassword(newPassword, resolvePasswordIterations(env.PASSWORD_ITERATIONS));
  await updateUserPassword(db, userId, password, now);
  await revokeAllSessions(db, userId, now);

  await writeAudit(
    db,
    {
      orgId: null,
      actorUserId: userId,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    now,
  );
}

export async function changePassword(
  env: Env,
  db: Db,
  userId: string,
  sessionId: string,
  input: { currentPassword: string; newPassword: string },
  meta: RequestMeta,
  now: number,
): Promise<void> {
  const user = await findUserById(db, userId);
  if (!user) throw AppError.unauthorized();

  const valid = await verifyPassword(input.currentPassword, {
    hash: user.password_hash,
    salt: user.password_salt,
    iterations: user.password_iterations,
  });
  if (!valid) throw AppError.badRequest('La contraseña actual no es correcta');

  const password = await hashPassword(input.newPassword, resolvePasswordIterations(env.PASSWORD_ITERATIONS));
  await updateUserPassword(db, userId, password, now);
  await revokeOtherSessions(db, userId, sessionId, now);

  await writeAudit(
    db,
    {
      orgId: null,
      actorUserId: userId,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    now,
  );
}

export async function createUserOrganization(
  env: Env,
  db: Db,
  userId: string,
  sessionId: string,
  input: z.infer<typeof createOrganizationSchema>,
  meta: RequestMeta,
  now: number,
): Promise<string> {
  void env;
  const trialPlan = await getPlanByKey(db, 'trial');
  if (!trialPlan) throw AppError.internal('El plan de prueba no está configurado');

  const orgId = await createOrganization(
    db,
    {
      name: input.name,
      currency: input.currency,
      timezone: input.timezone,
      ownerUserId: userId,
      trialPlanId: trialPlan.id,
      trialDays: trialPlan.trial_days,
    },
    now,
  );

  await setSessionOrg(db, sessionId, userId, orgId);

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: userId,
      action: 'organization.created',
      entityType: 'organization',
      entityId: orgId,
      after: { name: input.name, currency: input.currency },
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    now,
  );

  return orgId;
}

export async function sendInvitationEmail(
  env: Env,
  input: { orgName: string; email: string; roleName: string; token: string; invitedByName: string },
): Promise<void> {
  const url = `${appUrl(env)}/invitacion?token=${encodeURIComponent(input.token)}`;
  const message = invitationEmail(input.invitedByName, input.orgName, input.roleName, url);
  await sendEmail(env, { to: input.email, subject: message.subject, text: message.text, html: message.html });
}
