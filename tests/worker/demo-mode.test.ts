import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/worker/app';
import { dbFrom } from '../../src/worker/db';
import type { Env } from '../../src/worker/env';

const BASE = 'http://localhost';
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

const ORG = 'org_demo_test';
const USR_ADMIN = 'usr_demo_admin';
const USR_GUEST = 'usr_demo_guest';
const ROL_OWNER = 'rol_demo_owner';
const ROL_COLLECTOR = 'rol_demo_collector';

const db = () => dbFrom((env as unknown as Env).DB);

async function call(method: string, path: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json', 'cf-connecting-ip': '10.9.9.9' };
  if (cookie) headers.cookie = cookie;

  return app.fetch(new Request(`${BASE}${path}`, { method, headers }), env as unknown as Env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as never);
}

async function seedDemoOrg(): Promise<void> {
  const database = db();

  for (const [id, email, admin] of [
    [USR_ADMIN, 'admin@demo.test', 1],
    [USR_GUEST, 'invitado@demo.test', 0],
  ] as const) {
    await database.run(
      `INSERT OR IGNORE INTO users (id, email, full_name, password_hash, password_salt, password_iterations, email_verified_at, is_platform_admin, status, created_at, updated_at)
       VALUES (?, ?, 'Demo', 'x', 'y', 1, ?, ?, 'active', ?, ?)`,
      [id, email, NOW, admin, NOW, NOW],
    );
  }

  await database.run(
    `INSERT OR IGNORE INTO organizations (id, name, slug, owner_user_id, currency, status, created_at, updated_at)
     VALUES (?, 'Financiera Demo', 'financiera-demo', ?, 'NIO', 'active', ?, ?)`,
    [ORG, USR_ADMIN, NOW, NOW],
  );

  await database.run(
    `INSERT OR IGNORE INTO roles (id, org_id, key, name, is_system, created_at) VALUES
       (?, ?, 'owner', 'Propietario', 1, ?),
       (?, ?, 'collector', 'Cobrador', 1, ?)`,
    [ROL_OWNER, ORG, NOW, ROL_COLLECTOR, ORG, NOW],
  );

  await database.run(
    `INSERT OR IGNORE INTO organization_members (id, org_id, user_id, role_id, status, created_at, updated_at) VALUES
       ('mem_demo_admin', ?, ?, ?, 'active', ?, ?),
       ('mem_demo_guest', ?, ?, ?, 'active', ?, ?)`,
    [ORG, USR_ADMIN, ROL_OWNER, NOW, NOW, ORG, USR_GUEST, ROL_OWNER, NOW, NOW],
  );
}

describe('demo pública', () => {
  it('abre una sesión de solo lectura con un miembro sin privilegios de plataforma', async () => {
    await seedDemoOrg();

    const response = await call('POST', '/api/public/demo');
    expect(response.status).toBe(200);

    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(cookie).toContain('credibas_session');

    const me = await call('GET', '/api/auth/me', cookie);
    expect(me.status).toBe(200);
    const body = (await me.json()) as { isDemo: boolean; user: { email: string; isPlatformAdmin: boolean } };

    expect(body.isDemo).toBe(true);
    expect(body.user.isPlatformAdmin).toBe(false);
    expect(body.user.email).toBe('invitado@demo.test');
  });

  it('rechaza escrituras y el panel de plataforma', async () => {
    await seedDemoOrg();

    const session = await call('POST', '/api/public/demo');
    const cookie = (session.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const write = await call('POST', '/api/clients', cookie);
    expect(write.status).toBe(403);
    const writeBody = (await write.json()) as { error: { code: string } };
    expect(writeBody.error.code).toBe('demo_read_only');

    const admin = await call('GET', '/api/admin/overview', cookie);
    expect(admin.status).toBe(404);
  });
});
