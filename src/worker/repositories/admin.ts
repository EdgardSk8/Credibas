import type { Db } from '../db';
import { newId } from '../lib/crypto';
import type { PlanRow } from './subscriptions';

export interface AdminOverviewRow {
  organizations: number;
  activeSubscriptions: number;
  trialing: number;
  canceledLast30Days: number;
  mrrCents: number;
  users: number;
  clients: number;
  activeLoans: number;
  portfolioOutstandingCents: number;
}

export async function getAdminOverview(db: Db, now: number): Promise<AdminOverviewRow> {
  const row = await db.first<AdminOverviewRow>(
    `SELECT
      (SELECT COUNT(*) FROM organizations WHERE status <> 'closed') AS organizations,
      (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS activeSubscriptions,
      (SELECT COUNT(*) FROM subscriptions WHERE status = 'trialing') AS trialing,
      (SELECT COUNT(*) FROM subscriptions WHERE canceled_at IS NOT NULL AND canceled_at >= ?) AS canceledLast30Days,
      (SELECT COALESCE(SUM(CASE WHEN s.billing_cycle = 'yearly' THEN p.price_yearly_cents / 12 ELSE p.price_monthly_cents END), 0)
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active') AS mrrCents,
      (SELECT COUNT(*) FROM users WHERE status <> 'deleted') AS users,
      (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL) AS clients,
      (SELECT COUNT(*) FROM loans WHERE status = 'active' AND deleted_at IS NULL) AS activeLoans,
      (SELECT COALESCE(SUM(i.principal_cents + i.interest_cents + i.fee_cents
          - i.paid_principal_cents - i.paid_interest_cents - i.paid_fee_cents), 0)
         FROM installments i
         JOIN loans l ON l.id = i.loan_id
        WHERE i.version = l.schedule_version AND l.status = 'active' AND l.deleted_at IS NULL
          AND i.status IN ('pending', 'partial', 'overdue')) AS portfolioOutstandingCents`,
    [now - 30 * 24 * 60 * 60 * 1000],
  );

  return {
    organizations: Number(row?.organizations ?? 0),
    activeSubscriptions: Number(row?.activeSubscriptions ?? 0),
    trialing: Number(row?.trialing ?? 0),
    canceledLast30Days: Number(row?.canceledLast30Days ?? 0),
    mrrCents: Number(row?.mrrCents ?? 0),
    users: Number(row?.users ?? 0),
    clients: Number(row?.clients ?? 0),
    activeLoans: Number(row?.activeLoans ?? 0),
    portfolioOutstandingCents: Number(row?.portfolioOutstandingCents ?? 0),
  };
}

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'closed';
  currency: 'NIO' | 'USD';
  created_at: number;
  owner_name: string;
  owner_email: string;
  plan_key: string;
  subscription_status: string;
  trial_ends_at: number | null;
  current_period_end: number;
  members_count: number;
  clients_count: number;
  active_loans: number;
  outstanding_cents: number;
}

export async function listOrganizationsAdmin(
  db: Db,
  filters: { search?: string; status?: string; page: number; pageSize: number },
): Promise<{ items: AdminOrgRow[]; total: number }> {
  const where: string[] = ['1 = 1'];
  const params: Array<string | number> = [];

  if (filters.status && ['active', 'suspended', 'closed'].includes(filters.status)) {
    where.push('o.status = ?');
    params.push(filters.status);
  }
  if (filters.search) {
    where.push('(o.name LIKE ? OR o.slug LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }

  const whereSql = where.join(' AND ');
  const total = await db.count(
    `SELECT COUNT(*) AS total FROM organizations o JOIN users u ON u.id = o.owner_user_id WHERE ${whereSql}`,
    params,
  );

  const items = await db.all<AdminOrgRow>(
    `SELECT o.id, o.name, o.slug, o.status, o.currency, o.created_at,
            u.full_name AS owner_name, u.email AS owner_email,
            COALESCE(p.key, 'none') AS plan_key,
            COALESCE(s.status, 'expired') AS subscription_status,
            s.trial_ends_at, COALESCE(s.current_period_end, 0) AS current_period_end,
            (SELECT COUNT(*) FROM organization_members m WHERE m.org_id = o.id AND m.status = 'active') AS members_count,
            (SELECT COUNT(*) FROM clients c WHERE c.org_id = o.id AND c.deleted_at IS NULL) AS clients_count,
            (SELECT COUNT(*) FROM loans l WHERE l.org_id = o.id AND l.status = 'active' AND l.deleted_at IS NULL) AS active_loans,
            (SELECT COALESCE(SUM(i.principal_cents + i.interest_cents + i.fee_cents
                - i.paid_principal_cents - i.paid_interest_cents - i.paid_fee_cents), 0)
               FROM installments i JOIN loans l2 ON l2.id = i.loan_id
              WHERE i.org_id = o.id AND i.version = l2.schedule_version AND l2.status = 'active'
                AND i.status IN ('pending', 'partial', 'overdue')) AS outstanding_cents
       FROM organizations o
       JOIN users u ON u.id = o.owner_user_id
       LEFT JOIN subscriptions s ON s.org_id = o.id
       LEFT JOIN plans p ON p.id = s.plan_id
      WHERE ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { items, total };
}

export async function setOrgStatus(db: Db, orgId: string, status: 'active' | 'suspended' | 'closed', now: number): Promise<void> {
  await db.run(`UPDATE organizations SET status = ?, updated_at = ? WHERE id = ?`, [status, now, orgId]);
}

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string;
  status: string;
  email_verified_at: number | null;
  is_platform_admin: number;
  created_at: number;
  last_login_at: number | null;
  orgs_count: number;
}

export async function listUsersAdmin(
  db: Db,
  filters: { search?: string; page: number; pageSize: number },
): Promise<{ items: AdminUserRow[]; total: number }> {
  const where: string[] = [`u.status <> 'deleted'`];
  const params: Array<string | number> = [];
  if (filters.search) {
    where.push('(u.email LIKE ? OR u.full_name LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  const whereSql = where.join(' AND ');
  const total = await db.count(`SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`, params);
  const items = await db.all<AdminUserRow>(
    `SELECT u.id, u.email, u.full_name, u.status, u.email_verified_at, u.is_platform_admin, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM organization_members m WHERE m.user_id = u.id AND m.status = 'active') AS orgs_count
       FROM users u
      WHERE ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { items, total };
}

export interface PlanWriteInput {
  key: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  currency: string;
  trialDays: number;
  graceDays: number;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  features: string[];
  limits: Record<string, number>;
}

export async function upsertPlan(db: Db, input: PlanWriteInput, now: number): Promise<string> {
  const existing = await db.first<{ id: string }>(`SELECT id FROM plans WHERE key = ?`, [input.key]);
  const planId = existing?.id ?? newId('pln');

  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [];

  if (existing) {
    statements.push({
      sql: `UPDATE plans SET name = ?, description = ?, price_monthly_cents = ?, price_yearly_cents = ?, currency = ?,
              trial_days = ?, grace_days = ?, is_active = ?, is_public = ?, sort_order = ?, features_json = ?, updated_at = ?
            WHERE id = ?`,
      params: [
        input.name,
        input.description,
        input.priceMonthlyCents,
        input.priceYearlyCents,
        input.currency,
        input.trialDays,
        input.graceDays,
        input.isActive ? 1 : 0,
        input.isPublic ? 1 : 0,
        input.sortOrder,
        JSON.stringify(input.features),
        now,
        planId,
      ],
    });
    statements.push({ sql: `DELETE FROM plan_limits WHERE plan_id = ?`, params: [planId] });
  } else {
    statements.push({
      sql: `INSERT INTO plans (id, key, name, description, price_monthly_cents, price_yearly_cents, currency, trial_days,
              grace_days, is_active, is_public, sort_order, features_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        planId,
        input.key,
        input.name,
        input.description,
        input.priceMonthlyCents,
        input.priceYearlyCents,
        input.currency,
        input.trialDays,
        input.graceDays,
        input.isActive ? 1 : 0,
        input.isPublic ? 1 : 0,
        input.sortOrder,
        JSON.stringify(input.features),
        now,
        now,
      ],
    });
  }

  for (const [limitKey, limitValue] of Object.entries(input.limits)) {
    statements.push({
      sql: `INSERT INTO plan_limits (plan_id, limit_key, limit_value) VALUES (?, ?, ?)`,
      params: [planId, limitKey, Math.max(0, Math.trunc(limitValue))],
    });
  }

  await db.batch(statements);
  return planId;
}

export async function getPlatformSetting<T>(db: Db, key: string): Promise<T | null> {
  const row = await db.first<{ value_json: string }>(`SELECT value_json FROM settings WHERE org_id IS NULL AND key = ?`, [key]);
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

export async function setPlatformSetting(db: Db, key: string, value: unknown, updatedBy: string | null, now: number): Promise<void> {
  await db.run(
    `INSERT INTO settings (id, org_id, key, value_json, updated_by, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?)
     ON CONFLICT (COALESCE(org_id, ''), key) DO UPDATE SET value_json = excluded.value_json,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [newId('set'), key, JSON.stringify(value), updatedBy, now],
  );
}

export type { PlanRow };
