import type { Db } from '../db';
import { newId } from '../lib/crypto';

const RESET_TTL_MS = 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_COOLDOWN_MS = 60 * 1000;
const CODE_MAX_SENDS_PER_HOUR = 5;

export interface VerificationCodeRow {
  code_hash: string;
  created_at: number;
  expires_at: number;
  last_sent_at: number;
  sends: number;
  attempts: number;
}

export type IssueCodeResult =
  | { status: 'created' }
  | { status: 'cooldown'; retryAt: number }
  | { status: 'limit' };

/**
 * Guarda (o reemplaza) el código de verificación de un usuario. Mantiene la
 * ventana horaria de envíos y el cooldown entre reenvíos.
 */
export async function issueVerificationCode(
  db: Db,
  userId: string,
  codeHash: string,
  now: number,
): Promise<IssueCodeResult> {
  const existing = await db.first<VerificationCodeRow>(
    `SELECT code_hash, created_at, expires_at, last_sent_at, sends, attempts
       FROM email_verification_codes WHERE user_id = ?`,
    [userId],
  );

  if (!existing) {
    await db.run(
      `INSERT INTO email_verification_codes (user_id, code_hash, created_at, expires_at, last_sent_at, sends, attempts)
       VALUES (?, ?, ?, ?, ?, 1, 0)`,
      [userId, codeHash, now, now + CODE_TTL_MS, now],
    );
    return { status: 'created' };
  }

  if (now - existing.last_sent_at < CODE_COOLDOWN_MS) {
    return { status: 'cooldown', retryAt: existing.last_sent_at + CODE_COOLDOWN_MS };
  }

  const windowExpired = now - existing.created_at >= 60 * 60 * 1000;
  const sends = windowExpired ? 1 : existing.sends + 1;
  if (sends > CODE_MAX_SENDS_PER_HOUR) return { status: 'limit' };

  await db.run(
    `UPDATE email_verification_codes
        SET code_hash = ?, created_at = ?, expires_at = ?, last_sent_at = ?, sends = ?, attempts = 0
      WHERE user_id = ?`,
    [codeHash, windowExpired ? now : existing.created_at, now + CODE_TTL_MS, now, sends, userId],
  );
  return { status: 'created' };
}

export async function findVerificationCode(db: Db, userId: string): Promise<VerificationCodeRow | null> {
  return db.first<VerificationCodeRow>(
    `SELECT code_hash, created_at, expires_at, last_sent_at, sends, attempts
       FROM email_verification_codes WHERE user_id = ?`,
    [userId],
  );
}

export async function recordVerificationAttempt(db: Db, userId: string): Promise<void> {
  await db.run(`UPDATE email_verification_codes SET attempts = attempts + 1 WHERE user_id = ?`, [userId]);
}

export async function deleteVerificationCode(db: Db, userId: string): Promise<void> {
  await db.run(`DELETE FROM email_verification_codes WHERE user_id = ?`, [userId]);
}

export async function createPasswordReset(db: Db, userId: string, tokenHash: string, now: number): Promise<void> {
  await db.run(
    `INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at, consumed_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [newId('prs'), userId, tokenHash, now, now + RESET_TTL_MS],
  );
}

export async function consumePasswordReset(db: Db, tokenHash: string, now: number): Promise<string | null> {
  const row = await db.first<{ user_id: string }>(
    `UPDATE password_resets SET consumed_at = ?
      WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      RETURNING user_id`,
    [now, tokenHash, now],
  );
  return row?.user_id ?? null;
}

export async function purgeExpiredTokens(db: Db, now: number): Promise<void> {
  await db.batch([
    { sql: `DELETE FROM email_verifications WHERE expires_at < ? OR consumed_at IS NOT NULL`, params: [now] },
    { sql: `DELETE FROM email_verification_codes WHERE expires_at < ?`, params: [now] },
    { sql: `DELETE FROM password_resets WHERE expires_at < ? OR consumed_at IS NOT NULL`, params: [now] },
    { sql: `DELETE FROM invitations WHERE expires_at < ? AND accepted_at IS NULL`, params: [now] },
    { sql: `DELETE FROM login_attempts WHERE created_at < ?`, params: [now - 7 * 24 * 60 * 60 * 1000] },
  ]);
}
