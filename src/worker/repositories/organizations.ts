import type { Db } from '../db';
import { newId } from '../lib/crypto';
import { ROLE_TEMPLATES } from '../../shared/rbac';

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  currency: 'NIO' | 'USD';
  timezone: string;
  date_format: string;
  locale: string;
  logo_r2_key: string | null;
  status: 'active' | 'suspended' | 'closed';
  created_at: number;
  updated_at: number;
}

export interface MembershipContext {
  org: OrgRow;
  memberId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  memberStatus: string;
  permissions: string[];
  subscriptionStatus: string;
  planKey: string;
}

export interface MembershipListItem {
  orgId: string;
  memberId: string;
  orgName: string;
  orgSlug: string;
  currency: 'NIO' | 'USD';
  timezone: string;
  roleKey: string;
  roleName: string;
  subscriptionStatus: string;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'negocio';
}

export function generateSlug(name: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slugify(name)}-${suffix}`;
}

interface CreateOrgInput {
  name: string;
  currency: 'NIO' | 'USD';
  timezone: string;
  ownerUserId: string;
  trialPlanId: string;
  trialDays: number;
}

export async function createOrganization(db: Db, input: CreateOrgInput, now: number): Promise<string> {
  const orgId = newId('org');
  const roleIds = new Map<string, string>();
  for (const template of ROLE_TEMPLATES) roleIds.set(template.key, newId('rol'));
  const ownerRoleId = roleIds.get('owner') as string;

  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [];

  statements.push({
    sql: `INSERT INTO organizations (id, name, slug, owner_user_id, currency, timezone, date_format, locale,
                                     logo_r2_key, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'dd/MM/yyyy', 'es-NI', NULL, 'active', ?, ?)`,
    params: [orgId, input.name, generateSlug(input.name), input.ownerUserId, input.currency, input.timezone, now, now],
  });

  for (const template of ROLE_TEMPLATES) {
    statements.push({
      sql: `INSERT INTO roles (id, org_id, key, name, description, is_system, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      params: [roleIds.get(template.key) as string, orgId, template.key, template.name, template.description, now],
    });
    for (const permission of template.permissions) {
      statements.push({
        sql: `INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)`,
        params: [roleIds.get(template.key) as string, permission],
      });
    }
  }

  statements.push({
    sql: `INSERT INTO organization_members (id, org_id, user_id, role_id, status, invited_by, invited_at, accepted_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', NULL, NULL, ?, ?, ?)`,
    params: [newId('mem'), orgId, input.ownerUserId, ownerRoleId, now, now, now],
  });

  const periodEnd = now + input.trialDays * 24 * 60 * 60 * 1000;
  statements.push({
    sql: `INSERT INTO subscriptions (id, org_id, plan_id, status, billing_cycle, trial_ends_at,
                                     current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at, updated_at)
          VALUES (?, ?, ?, 'trialing', 'monthly', ?, ?, ?, 0, NULL, ?, ?)`,
    params: [newId('sub'), orgId, input.trialPlanId, periodEnd, now, periodEnd, now, now],
  });

  statements.push({
    sql: `INSERT INTO settings (id, org_id, key, value_json, updated_by, updated_at) VALUES (?, ?, 'org.preferences', ?, ?, ?)`,
    params: [
      newId('set'),
      orgId,
      JSON.stringify({
        defaultLateFeeDailyBps: 50,
        defaultGraceDays: 0,
        allocationOrder: ['late_fee', 'interest', 'principal', 'fee'],
        paymentMethods: ['cash', 'transfer'],
        reminderDaysBeforeDue: 2,
      }),
      input.ownerUserId,
      now,
    ],
  });

  for (const [name, prefix] of [
    ['client', 'CLI'],
    ['loan', 'PRE'],
  ] as const) {
    statements.push({
      sql: `INSERT INTO sequences (org_id, name, prefix, next_value) VALUES (?, ?, ?, 1)`,
      params: [orgId, name, prefix],
    });
  }

  statements.push({
    sql: `INSERT INTO subscription_events (id, org_id, subscription_id, type, data_json, actor_user_id, created_at)
          VALUES (?, ?, NULL, 'trial_started', ?, ?, ?)`,
    params: [newId('sev'), orgId, JSON.stringify({ trialDays: input.trialDays }), input.ownerUserId, now],
  });

  await db.batch(statements);
  return orgId;
}

export async function listMembershipsForUser(db: Db, userId: string): Promise<MembershipListItem[]> {
  return db.all<MembershipListItem>(
    `SELECT o.id AS orgId, m.id AS memberId, o.name AS orgName, o.slug AS orgSlug, o.currency,
            o.timezone, r.key AS roleKey, r.name AS roleName,
            COALESCE(s.status, 'expired') AS subscriptionStatus
       FROM organization_members m
       JOIN organizations o ON o.id = m.org_id
       JOIN roles r ON r.id = m.role_id
       LEFT JOIN subscriptions s ON s.org_id = o.id
      WHERE m.user_id = ? AND m.status = 'active' AND o.status <> 'closed'
      ORDER BY o.name ASC`,
    [userId],
  );
}

export async function getMembershipContext(db: Db, userId: string, orgId: string): Promise<MembershipContext | null> {
  const row = await db.first<{
    id: string;
    name: string;
    slug: string;
    owner_user_id: string;
    currency: 'NIO' | 'USD';
    timezone: string;
    date_format: string;
    locale: string;
    logo_r2_key: string | null;
    status: 'active' | 'suspended' | 'closed';
    created_at: number;
    updated_at: number;
    member_id: string;
    member_status: string;
    role_id: string;
    role_key: string;
    role_name: string;
    subscription_status: string | null;
    plan_key: string | null;
  }>(
    `SELECT o.id, o.name, o.slug, o.owner_user_id, o.currency, o.timezone, o.date_format, o.locale,
            o.logo_r2_key, o.status, o.created_at, o.updated_at,
            m.id AS member_id, m.status AS member_status,
            r.id AS role_id, r.key AS role_key, r.name AS role_name,
            s.status AS subscription_status, p.key AS plan_key
       FROM organization_members m
       JOIN organizations o ON o.id = m.org_id
       JOIN roles r ON r.id = m.role_id
       LEFT JOIN subscriptions s ON s.org_id = o.id
       LEFT JOIN plans p ON p.id = s.plan_id
      WHERE m.user_id = ? AND m.org_id = ?`,
    [userId, orgId],
  );
  if (!row) return null;
  if (row.member_status !== 'active') return null;

  const permissions = await db.all<{ permission_key: string }>(
    `SELECT permission_key FROM role_permissions WHERE role_id = ?`,
    [row.role_id],
  );

  return {
    org: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      owner_user_id: row.owner_user_id,
      currency: row.currency,
      timezone: row.timezone,
      date_format: row.date_format,
      locale: row.locale,
      logo_r2_key: row.logo_r2_key,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    memberId: row.member_id,
    roleId: row.role_id,
    roleKey: row.role_key,
    roleName: row.role_name,
    memberStatus: row.member_status,
    permissions: permissions.map((item) => item.permission_key),
    subscriptionStatus: row.subscription_status ?? 'expired',
    planKey: row.plan_key ?? 'trial',
  };
}

export async function getOrgById(db: Db, orgId: string): Promise<OrgRow | null> {
  return db.first<OrgRow>(
    `SELECT id, name, slug, owner_user_id, currency, timezone, date_format, locale, logo_r2_key, status, created_at, updated_at
       FROM organizations WHERE id = ?`,
    [orgId],
  );
}

export async function updateOrganization(
  db: Db,
  orgId: string,
  input: { name?: string; currency?: 'NIO' | 'USD'; timezone?: string; dateFormat?: string; logoR2Key?: string | null },
  now: number,
): Promise<void> {
  const fields: string[] = [];
  const params: Array<string | number | null> = [];

  if (input.name !== undefined) {
    fields.push('name = ?');
    params.push(input.name);
  }
  if (input.currency !== undefined) {
    fields.push('currency = ?');
    params.push(input.currency);
  }
  if (input.timezone !== undefined) {
    fields.push('timezone = ?');
    params.push(input.timezone);
  }
  if (input.dateFormat !== undefined) {
    fields.push('date_format = ?');
    params.push(input.dateFormat);
  }
  if (input.logoR2Key !== undefined) {
    fields.push('logo_r2_key = ?');
    params.push(input.logoR2Key);
  }

  fields.push('updated_at = ?');
  params.push(now);
  params.push(orgId);

  await db.run(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`, params);
}

export async function countOrganizations(db: Db): Promise<number> {
  return db.count(`SELECT COUNT(*) AS total FROM organizations WHERE status <> 'closed'`);
}

export async function getOrgSetting<T>(db: Db, orgId: string, key: string): Promise<T | null> {
  const row = await db.first<{ value_json: string }>(`SELECT value_json FROM settings WHERE org_id = ? AND key = ?`, [
    orgId,
    key,
  ]);
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

export async function setOrgSetting(
  db: Db,
  orgId: string,
  key: string,
  value: unknown,
  updatedBy: string | null,
  now: number,
): Promise<void> {
  await db.run(
    `INSERT INTO settings (id, org_id, key, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (COALESCE(org_id, ''), key) DO UPDATE SET value_json = excluded.value_json,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [newId('set'), orgId, key, JSON.stringify(value), updatedBy, now],
  );
}
