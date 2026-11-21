import { Hono } from 'hono';
import { dbFrom } from '../db';
import { AppError } from '../lib/errors';
import { hashToken, randomToken } from '../lib/crypto';
import { parseBody } from '../middleware/core';
import { requireAuth, requireOrg, requirePermission, requireVerifiedEmail } from '../middleware/guards';
import { PERMISSIONS, ROLE_LABELS } from '../../shared/rbac';
import { createOrganizationSchema, inviteMemberSchema, organizationSettingsSchema, updateMemberSchema } from '../../shared/validation';
import { createUserOrganization, sendInvitationEmail } from '../services/auth-service';
import { getLimitState } from '../services/limits';
import {
  getOrgSetting,
  getOrgById,
  listMembershipsForUser,
  setOrgSetting,
  updateOrganization,
} from '../repositories/organizations';
import {
  createInvitation,
  findMemberById,
  findRoleByKey,
  listMembers,
  listPendingInvitations,
  listRoles,
  removeMember,
  updateMemberRole,
  updateMemberStatus,
} from '../repositories/members';
import { getOrgUsage } from '../repositories/subscriptions';
import { listAudit, writeAudit } from '../repositories/audit';
import type { AppEnv } from '../types';

export const organizationRoutes = new Hono<AppEnv>();

organizationRoutes.post('/', requireAuth, requireVerifiedEmail, async (c) => {
  const db = dbFrom(c.env.DB);
  const input = await parseBody(c, createOrganizationSchema);
  const sessionId = c.get('sessionId') as string;
  const userId = c.get('userId') as string;

  const orgId = await createUserOrganization(
    c.env,
    db,
    userId,
    sessionId,
    input,
    { ip: c.get('clientIp'), userAgent: c.req.header('user-agent') ?? 'unknown' },
    Date.now(),
  );

  return c.json({ ok: true, orgId }, 201);
});

organizationRoutes.get('/', requireAuth, async (c) => {
  const db = dbFrom(c.env.DB);
  const memberships = await listMembershipsForUser(db, c.get('userId') as string);
  return c.json({ items: memberships, activeOrgId: c.get('orgId') });
});

organizationRoutes.get('/current', requireAuth, async (c) => {
  const db = dbFrom(c.env.DB);

  // Sin organización provisional: permite saber si falta crear el negocio.
  const orgId = c.get('orgId');
  if (!orgId) {
    return c.json({ organization: null, needsOnboarding: true, memberships: await listMembershipsForUser(db, c.get('userId') as string) });
  }

  const org = await getOrgById(db, orgId);
  if (!org) throw AppError.notFound('Organización no encontrada');

  const preferences = await getOrgSetting<Record<string, unknown>>(db, orgId, 'org.preferences');
  const limits = await getLimitState(db, orgId);

  return c.json({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      currency: org.currency,
      timezone: org.timezone,
      dateFormat: org.date_format,
      locale: org.locale,
      status: org.status,
      logoUrl: org.logo_r2_key ? `/api/files/logo/${org.id}` : null,
      createdAt: new Date(org.created_at).toISOString(),
    },
    preferences,
    role: c.get('roleKey'),
    permissions: c.get('permissions'),
    limits,
  });
});

organizationRoutes.patch('/current', requireAuth, requireOrg, requirePermission(PERMISSIONS.orgSettings), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const input = await parseBody(c, organizationSettingsSchema);
  const now = Date.now();

  const before = await getOrgById(db, orgId);

  await updateOrganization(
    db,
    orgId,
    {
      name: input.name,
      currency: input.currency,
      timezone: input.timezone,
      dateFormat: input.dateFormat,
    },
    now,
  );

  if (
    input.defaultLateFeeDailyBps !== undefined ||
    input.defaultGraceDays !== undefined ||
    input.allocationOrder !== undefined ||
    input.paymentMethods !== undefined
  ) {
    const current = (await getOrgSetting<Record<string, unknown>>(db, orgId, 'org.preferences')) ?? {};
    await setOrgSetting(
      db,
      orgId,
      'org.preferences',
      {
        ...current,
        ...(input.defaultLateFeeDailyBps !== undefined ? { defaultLateFeeDailyBps: input.defaultLateFeeDailyBps } : {}),
        ...(input.defaultGraceDays !== undefined ? { defaultGraceDays: input.defaultGraceDays } : {}),
        ...(input.allocationOrder !== undefined ? { allocationOrder: input.allocationOrder } : {}),
        ...(input.paymentMethods !== undefined ? { paymentMethods: input.paymentMethods } : {}),
      },
      c.get('userId'),
      now,
    );
  }

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId'),
      action: 'organization.updated',
      entityType: 'organization',
      entityId: orgId,
      before: before ? { name: before.name, currency: before.currency, timezone: before.timezone } : undefined,
      after: input,
      ip: c.get('clientIp'),
      userAgent: c.req.header('user-agent') ?? null,
    },
    now,
  );

  return c.json({ ok: true });
});

organizationRoutes.get('/members', requireAuth, requireOrg, requirePermission(PERMISSIONS.membersRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const members = await listMembers(db, orgId);
  const invitations = await listPendingInvitations(db, orgId, Date.now());
  const roles = await listRoles(db, orgId);
  const usage = await getOrgUsage(db, orgId);

  return c.json({
    items: members.map((member) => ({
      memberId: member.memberId,
      userId: member.userId,
      fullName: member.fullName,
      email: member.email,
      role: member.roleKey,
      roleName: member.roleName,
      status: member.status,
      lastLoginAt: member.lastLoginAt ? new Date(member.lastLoginAt).toISOString() : null,
      createdAt: new Date(member.createdAt).toISOString(),
    })),
    invitations: invitations.map((item) => ({
      id: item.id,
      email: item.email,
      roleName: item.roleName,
      createdAt: new Date(item.createdAt).toISOString(),
      expiresAt: new Date(item.expiresAt).toISOString(),
    })),
    roles,
    usage,
  });
});

organizationRoutes.post('/members/invite', requireAuth, requireOrg, requirePermission(PERMISSIONS.membersInvite), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const input = await parseBody(c, inviteMemberSchema);
  const now = Date.now();

  const state = await getLimitState(db, orgId);
  const userLimit = state.limits.users;
  if (userLimit !== undefined && userLimit >= 0 && (state.usage.users ?? 0) + 1 > userLimit) {
    throw AppError.limitExceeded(`Tu plan permite ${userLimit} usuario(s). Actualiza tu plan para invitar más.`, {
      metric: 'users',
      limit: userLimit,
    });
  }

  const role = await findRoleByKey(db, orgId, input.roleKey);
  if (!role) throw AppError.badRequest('Rol inválido');

  const existing = await db.first<{ id: string }>(
    `SELECT m.id FROM organization_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? AND u.email = ? AND m.status <> 'removed'`,
    [orgId, input.email],
  );
  if (existing) throw AppError.conflict('Ese correo ya pertenece a un miembro del negocio');

  const token = randomToken();
  await createInvitation(db, {
    orgId,
    email: input.email,
    roleId: role.id,
    tokenHash: await hashToken(token),
    invitedBy: c.get('userId') as string,
  }, now);

  const org = await getOrgById(db, orgId);
  await sendInvitationEmail(c.env, {
    orgName: org?.name ?? 'Credibas',
    email: input.email,
    roleName: ROLE_LABELS[input.roleKey],
    token,
    invitedByName: c.get('userFullName') ?? 'Tu equipo',
  });

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId'),
      action: 'member.invited',
      entityType: 'organization_member',
      entityId: input.email,
      after: { email: input.email, role: input.roleKey },
      ip: c.get('clientIp'),
      userAgent: c.req.header('user-agent') ?? null,
    },
    now,
  );

  return c.json({ ok: true, message: 'Invitación enviada.' }, 201);
});

organizationRoutes.patch('/members/:id', requireAuth, requireOrg, requirePermission(PERMISSIONS.membersUpdate), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const memberId = c.req.param('id');
  const input = await parseBody(c, updateMemberSchema);
  const now = Date.now();

  const member = await findMemberById(db, orgId, memberId);
  if (!member) throw AppError.notFound('Miembro no encontrado');

  const org = await getOrgById(db, orgId);
  if (org?.owner_user_id === member.user_id && input.roleKey !== 'owner') {
    throw AppError.conflict('No puedes cambiar el rol del propietario');
  }

  if (input.roleKey === 'owner') {
    throw AppError.forbidden('La propiedad del negocio no se transfiere desde aquí');
  }

  const role = await findRoleByKey(db, orgId, input.roleKey);
  if (!role) throw AppError.badRequest('Rol inválido');

  await updateMemberRole(db, orgId, memberId, role.id, now);
  if (input.status) await updateMemberStatus(db, orgId, memberId, input.status, now);

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId'),
      action: 'member.updated',
      entityType: 'organization_member',
      entityId: memberId,
      before: { roleId: member.role_id, status: member.status },
      after: input,
      ip: c.get('clientIp'),
      userAgent: c.req.header('user-agent') ?? null,
    },
    now,
  );

  return c.json({ ok: true });
});

organizationRoutes.delete('/members/:id', requireAuth, requireOrg, requirePermission(PERMISSIONS.membersRemove), async (c) => {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const memberId = c.req.param('id');
  const now = Date.now();

  const member = await findMemberById(db, orgId, memberId);
  if (!member) throw AppError.notFound('Miembro no encontrado');

  const org = await getOrgById(db, orgId);
  if (org?.owner_user_id === member.user_id) throw AppError.conflict('No puedes remover al propietario');

  await removeMember(db, orgId, memberId, now);

  await writeAudit(
    db,
    {
      orgId,
      actorUserId: c.get('userId'),
      action: 'member.removed',
      entityType: 'organization_member',
      entityId: memberId,
      ip: c.get('clientIp'),
      userAgent: c.req.header('user-agent') ?? null,
    },
    now,
  );

  return c.json({ ok: true });
});

organizationRoutes.get('/audit', requireAuth, requireOrg, requirePermission(PERMISSIONS.auditRead), async (c) => {
  const db = dbFrom(c.env.DB);
  const query = new URL(c.req.url).searchParams;
  const page = Math.max(1, Number(query.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize') ?? 30)));
  const result = await listAudit(db, c.get('orgId') as string, {
    page,
    pageSize,
    action: query.get('action') ?? undefined,
    entityType: query.get('entityType') ?? undefined,
  });

  return c.json({
    items: result.items.map((item) => ({
      id: item.id,
      action: item.action,
      entityType: item.entity_type,
      entityId: item.entity_id,
      actorName: item.actor_name,
      createdAt: new Date(item.created_at).toISOString(),
    })),
    page,
    pageSize,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
  });
});
