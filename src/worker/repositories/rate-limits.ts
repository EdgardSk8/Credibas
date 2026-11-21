import type { Db } from '../db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Ventana fija atómica: una sola sentencia UPSERT incrementa el contador,
 * incluso con requests concurrentes.
 */
export async function hitRateLimit(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;

  const row = await db.first<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
       window_start = excluded.window_start
     RETURNING count`,
    [`${key}:${windowStart}`, windowStart],
  );

  const count = Number(row?.count ?? 1);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}

export async function purgeRateLimits(db: Db, olderThanMs: number): Promise<number> {
  const result = await db.run(`DELETE FROM rate_limits WHERE window_start < ?`, [olderThanMs]);
  return result.meta.changes ?? 0;
}

export async function recordLoginAttempt(
  db: Db,
  input: { identifier: string; ip: string | null; success: boolean },
  now: number,
): Promise<void> {
  await db.run(`INSERT INTO login_attempts (id, identifier, ip, success, created_at) VALUES (?, ?, ?, ?, ?)`, [
    crypto.randomUUID(),
    input.identifier.toLowerCase(),
    input.ip,
    input.success ? 1 : 0,
    now,
  ]);
}

export async function countRecentFailedAttempts(
  db: Db,
  identifier: string,
  ip: string | null,
  sinceMs: number,
): Promise<number> {
  return db.count(
    `SELECT COUNT(*) AS total FROM login_attempts
      WHERE success = 0 AND created_at >= ? AND (identifier = ? OR (? IS NOT NULL AND ip = ?))`,
    [sinceMs, identifier.toLowerCase(), ip, ip],
  );
}
