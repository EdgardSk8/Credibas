import type { Db } from '../db';
import { newId } from '../lib/crypto';

export interface SessionRow {
  id: string;
  user_id: string;
  org_id: string | null;
  token_hash: string;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
  last_used_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export interface SessionWithUser extends SessionRow {
  email: string;
  full_name: string;
  email_verified_at: number | null;
  is_platform_admin: number;
  user_status: 'active' | 'blocked' | 'deleted';
}

export const SESSION_COOKIE = 'credibas_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(
  db: Db,
  input: { userId: string; orgId: string | null; tokenHash: string; ip: string | null; userAgent: string | null },
  now: number,
): Promise<string> {
  const id = newId('ses');
  await db.run(
    `INSERT INTO sessions (id, user_id, org_id, token_hash, ip, user_agent, created_at, last_used_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [id, input.userId, input.orgId, input.tokenHash, input.ip, input.userAgent, now, now, now + SESSION_TTL_MS],
  );
  return id;
}

export async function findSessionByTokenHash(db: Db, tokenHash: string): Promise<SessionWithUser | null> {
  return db.first<SessionWithUser>(
    `SELECT s.id, s.user_id, s.org_id, s.token_hash, s.ip, s.user_agent, s.created_at, s.last_used_at,
            s.expires_at, s.revoked_at, u.email, u.full_name, u.email_verified_at, u.is_platform_admin,
            u.status AS user_status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [tokenHash],
  );
}

export async function touchSession(db: Db, sessionId: string, now: number): Promise<void> {
  await db.run(`UPDATE sessions SET last_used_at = ? WHERE id = ?`, [now, sessionId]);
}

export async function revokeSession(db: Db, sessionId: string, userId: string, now: number): Promise<void> {
  await db.run(`UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?`, [now, sessionId, userId]);
}

export async function revokeOtherSessions(db: Db, userId: string, keepSessionId: string, now: number): Promise<void> {
  await db.run(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL`, [
    now,
    userId,
    keepSessionId,
  ]);
}

export async function revokeAllSessions(db: Db, userId: string, now: number): Promise<void> {
  await db.run(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [now, userId]);
}

export async function setSessionOrg(db: Db, sessionId: string, userId: string, orgId: string): Promise<void> {
  await db.run(`UPDATE sessions SET org_id = ? WHERE id = ? AND user_id = ?`, [orgId, sessionId, userId]);
}

export async function listUserSessions(db: Db, userId: string, now: number): Promise<SessionRow[]> {
  return db.all<SessionRow>(
    `SELECT id, user_id, org_id, token_hash, ip, user_agent, created_at, last_used_at, expires_at, revoked_at
       FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY last_used_at DESC`,
    [userId, now],
  );
}

export async function deleteExpiredSessions(db: Db, now: number): Promise<number> {
  const result = await db.run(`DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`, [
    now,
    now - 7 * 24 * 60 * 60 * 1000,
  ]);
  return result.meta.changes ?? 0;
}
