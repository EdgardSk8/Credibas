import type { Db } from '../db';
import { newId } from '../lib/crypto';

export interface AuditInput {
  orgId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Registro de auditoría. Nunca incluye contraseñas, tokens ni datos de pago
 * sensibles: solo referencias e importes.
 */
export async function writeAudit(db: Db, input: AuditInput, now: number): Promise<void> {
  await db.run(
    `INSERT INTO audit_logs (id, org_id, actor_user_id, action, entity_type, entity_id, before_json, after_json, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId('aud'),
      input.orgId,
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.ip ?? null,
      input.userAgent ?? null,
      now,
    ],
  );
}

export async function listAudit(
  db: Db,
  orgId: string,
  filters: { page: number; pageSize: number; action?: string; entityType?: string },
): Promise<{ items: Array<{ id: string; action: string; entity_type: string; entity_id: string | null; actor_name: string | null; created_at: number }>; total: number }> {
  const where: string[] = ['a.org_id = ?'];
  const params: Array<string | number> = [orgId];

  if (filters.action) {
    where.push('a.action LIKE ?');
    params.push(`%${filters.action}%`);
  }
  if (filters.entityType) {
    where.push('a.entity_type = ?');
    params.push(filters.entityType);
  }

  const whereSql = where.join(' AND ');
  const total = await db.count(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${whereSql}`, params);
  const items = await db.all<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    actor_name: string | null;
    created_at: number;
  }>(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, u.full_name AS actor_name, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { items, total };
}
