import type { Db } from '../db';
import { newId } from '../lib/crypto';

export interface MemberRow {
  id: string;
  org_id: string;
  user_id: string;
  role_id: string;
  status: 'invited' | 'active' | 'suspended' | 'removed';
  invited_by: string | null;
  invited_at: number | null;
  accepted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface MemberListItem {
  memberId: string;
  userId: string;
  fullName: string;
  email: string;
  roleKey: string;
  roleName: string;
  status: string;
  lastLoginAt: number | null;
  createdAt: number;
}

export async function listMembers(db: Db, orgId: string): Promise<MemberListItem[]> {
  return db.all<MemberListItem>(
    `SELECT m.id AS memberId, u.id AS userId, u.full_name AS fullName, u.email,
            r.key AS roleKey, r.name AS roleName, m.status, u.last_login_at AS lastLoginAt, m.created_at AS createdAt
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
       JOIN roles r ON r.id = m.role_id
      WHERE m.org_id = ? AND m.status <> 'removed'
      ORDER BY u.full_name ASC`,
    [orgId],
  );
}

export async function listRoles(db: Db, orgId: string) {
  return db.all<{ id: string; key: string; name: string; description: string | null; isSystem: number }>(
    `SELECT id, key, name, description, is_system AS isSystem FROM roles WHERE org_id = ? ORDER BY is_system DESC, name ASC`,
    [orgId],
  );
}

export async function findRoleByKey(db: Db, orgId: string, key: string): Promise<{ id: string } | null> {
  return db.first<{ id: string }>(`SELECT id FROM roles WHERE org_id = ? AND key = ?`, [orgId, key]);
}

export async function findMemberById(db: Db, orgId: string, memberId: string): Promise<MemberRow | null> {
  return db.first<MemberRow>(
    `SELECT id, org_id, user_id, role_id, status, invited_by, invited_at, accepted_at, created_at, updated_at
       FROM organization_members WHERE org_id = ? AND id = ?`,
    [orgId, memberId],
  );
}

export async function findMemberByUserId(db: Db, orgId: string, userId: string): Promise<MemberRow | null> {
  return db.first<MemberRow>(
    `SELECT id, org_id, user_id, role_id, status, invited_by, invited_at, accepted_at, created_at, updated_at
       FROM organization_members WHERE org_id = ? AND user_id = ?`,
    [orgId, userId],
  );
}

export async function updateMemberRole(db: Db, orgId: string, memberId: string, roleId: string, now: number): Promise<void> {
  await db.run(`UPDATE organization_members SET role_id = ?, updated_at = ? WHERE org_id = ? AND id = ?`, [
    roleId,
    now,
    orgId,
    memberId,
  ]);
}

export async function updateMemberStatus(db: Db, orgId: string, memberId: string, status: string, now: number): Promise<void> {
  await db.run(`UPDATE organization_members SET status = ?, updated_at = ? WHERE org_id = ? AND id = ?`, [
    status,
    now,
    orgId,
    memberId,
  ]);
}

export async function removeMember(db: Db, orgId: string, memberId: string, now: number): Promise<void> {
  await db.run(`UPDATE organization_members SET status = 'removed', updated_at = ? WHERE org_id = ? AND id = ?`, [
    now,
    orgId,
    memberId,
  ]);
}

export async function countActiveMembers(db: Db, orgId: string): Promise<number> {
  return db.count(
    `SELECT COUNT(*) AS total FROM organization_members WHERE org_id = ? AND status IN ('active', 'invited')`,
    [orgId],
  );
}

export async function countCollectors(db: Db, orgId: string): Promise<number> {
  return db.count(
    `SELECT COUNT(*) AS total FROM organization_members m JOIN roles r ON r.id = m.role_id
      WHERE m.org_id = ? AND m.status = 'active' AND r.key = 'collector'`,
    [orgId],
  );
}

// ---------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------
export interface InvitationRow {
  id: string;
  org_id: string;
  email: string;
  role_id: string;
  token_hash: string;
  invited_by: string;
  created_at: number;
  expires_at: number;
  accepted_at: number | null;
}

export async function createInvitation(
  db: Db,
  input: { orgId: string; email: string; roleId: string; tokenHash: string; invitedBy: string },
  now: number,
): Promise<string> {
  const id = newId('inv');
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  await db.run(
    `INSERT INTO invitations (id, org_id, email, role_id, token_hash, invited_by, created_at, expires_at, accepted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [id, input.orgId, input.email.toLowerCase(), input.roleId, input.tokenHash, input.invitedBy, now, expiresAt],
  );
  return id;
}

export async function findInvitationByTokenHash(db: Db, tokenHash: string): Promise<InvitationRow | null> {
  return db.first<InvitationRow>(
    `SELECT id, org_id, email, role_id, token_hash, invited_by, created_at, expires_at, accepted_at
       FROM invitations WHERE token_hash = ?`,
    [tokenHash],
  );
}

export async function listPendingInvitations(db: Db, orgId: string, now: number) {
  return db.all<{ id: string; email: string; roleName: string; createdAt: number; expiresAt: number }>(
    `SELECT i.id, i.email, r.name AS roleName, i.created_at AS createdAt, i.expires_at AS expiresAt
       FROM invitations i JOIN roles r ON r.id = i.role_id
      WHERE i.org_id = ? AND i.accepted_at IS NULL AND i.expires_at > ?
      ORDER BY i.created_at DESC`,
    [orgId, now],
  );
}

export async function acceptInvitation(
  db: Db,
  input: { invitationId: string; orgId: string; userId: string; roleId: string },
  now: number,
): Promise<void> {
  const existing = await findMemberByUserId(db, input.orgId, input.userId);
  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [
    {
      sql: `UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL`,
      params: [now, input.invitationId],
    },
  ];

  if (existing) {
    statements.push({
      sql: `UPDATE organization_members SET status = 'active', role_id = ?, accepted_at = COALESCE(accepted_at, ?), updated_at = ?
             WHERE id = ?`,
      params: [input.roleId, now, now, existing.id],
    });
  } else {
    statements.push({
      sql: `INSERT INTO organization_members (id, org_id, user_id, role_id, status, invited_by, invited_at, accepted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?)`,
      params: [newId('mem'), input.orgId, input.userId, input.roleId, now, now, now, now],
    });
  }

  await db.batch(statements);
}
