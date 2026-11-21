import type { Db } from '../db';
import { newId } from '../lib/crypto';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export async function createEmailVerification(db: Db, userId: string, tokenHash: string, now: number): Promise<void> {
  await db.run(
    `INSERT INTO email_verifications (id, user_id, token_hash, created_at, expires_at, consumed_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [newId('emv'), userId, tokenHash, now, now + VERIFICATION_TTL_MS],
  );
}

/** Consume el token de forma atómica y de un solo uso. */
export async function consumeEmailVerification(db: Db, tokenHash: string, now: number): Promise<string | null> {
  const row = await db.first<{ user_id: string }>(
    `UPDATE email_verifications SET consumed_at = ?
      WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      RETURNING user_id`,
    [now, tokenHash, now],
  );
  return row?.user_id ?? null;
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
    { sql: `DELETE FROM password_resets WHERE expires_at < ? OR consumed_at IS NOT NULL`, params: [now] },
    { sql: `DELETE FROM invitations WHERE expires_at < ? AND accepted_at IS NULL`, params: [now] },
    { sql: `DELETE FROM login_attempts WHERE created_at < ?`, params: [now - 7 * 24 * 60 * 60 * 1000] },
  ]);
}
