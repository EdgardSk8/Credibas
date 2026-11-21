import type { Db } from '../db';
import { newId } from '../lib/crypto';

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  email_verified_at: number | null;
  is_platform_admin: number;
  status: 'active' | 'blocked' | 'deleted';
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  return db.first<UserRow>(
    `SELECT id, email, full_name, password_hash, password_salt, password_iterations,
            email_verified_at, is_platform_admin, status, last_login_at, created_at, updated_at
       FROM users WHERE email = ?`,
    [email.toLowerCase()],
  );
}

export async function findUserById(db: Db, id: string): Promise<UserRow | null> {
  return db.first<UserRow>(
    `SELECT id, email, full_name, password_hash, password_salt, password_iterations,
            email_verified_at, is_platform_admin, status, last_login_at, created_at, updated_at
       FROM users WHERE id = ?`,
    [id],
  );
}

export async function createUser(
  db: Db,
  input: { email: string; fullName: string; passwordHash: string; passwordSalt: string; passwordIterations: number },
  now: number,
): Promise<string> {
  const id = newId('usr');
  await db.run(
    `INSERT INTO users (id, email, full_name, password_hash, password_salt, password_iterations,
                        email_verified_at, is_platform_admin, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 'active', ?, ?)`,
    [id, input.email.toLowerCase(), input.fullName, input.passwordHash, input.passwordSalt, input.passwordIterations, now, now],
  );
  return id;
}

export async function markEmailVerified(db: Db, userId: string, now: number): Promise<void> {
  await db.run(`UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ? AND email_verified_at IS NULL`, [
    now,
    now,
    userId,
  ]);
}

export async function updateUserPassword(
  db: Db,
  userId: string,
  password: { hash: string; salt: string; iterations: number },
  now: number,
): Promise<void> {
  await db.run(
    `UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?`,
    [password.hash, password.salt, password.iterations, now, userId],
  );
}

export async function touchLastLogin(db: Db, userId: string, now: number): Promise<void> {
  await db.run(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`, [now, now, userId]);
}

export async function setUserStatus(db: Db, userId: string, status: 'active' | 'blocked'): Promise<void> {
  await db.run(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`, [status, Date.now(), userId]);
}

export async function countUsers(db: Db): Promise<number> {
  return db.count(`SELECT COUNT(*) AS total FROM users WHERE status <> 'deleted'`);
}
