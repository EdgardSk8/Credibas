import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/worker/app';
import type { Env } from '../../src/worker/env';
import { addMonths } from '../../src/shared/finance/dates';

const BASE = 'http://localhost';
const PASSWORD = 'Credibas2026x';

interface CallOptions {
  cookie?: string;
  ip?: string;
  body?: unknown;
}

async function call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  headers['cf-connecting-ip'] = options.ip ?? '10.0.0.1';

  const request = new Request(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  return app.fetch(request, env as unknown as Env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as never);
}

function sessionCookie(response: Response): string {
  const raw = response.headers.get('set-cookie');
  if (!raw) throw new Error('La respuesta no incluyó cookie de sesión');
  return raw.split(';')[0] as string;
}

async function registerVerifiedUser(suffix: string, ip: string): Promise<{ cookie: string; email: string }> {
  const email = `persona-${suffix}@credibas.test`;

  const registered = await call('POST', '/api/auth/register', {
    ip,
    body: { fullName: `Persona ${suffix}`, email, password: PASSWORD, acceptTerms: true },
  });
  expect(registered.status).toBe(201);

  await env.DB.prepare(`UPDATE users SET email_verified_at = ? WHERE email = ?`).bind(Date.now(), email).run();

  const login = await call('POST', '/api/auth/login', { ip, body: { email, password: PASSWORD } });
  expect(login.status).toBe(200);

  return { cookie: sessionCookie(login), email };
}

async function createOrganization(cookie: string, name: string): Promise<string> {
  const response = await call('POST', '/api/organizations', {
    cookie,
    body: { name, currency: 'NIO', timezone: 'America/Managua' },
  });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as { orgId: string };
  return payload.orgId;
}

async function createClient(cookie: string, fullName: string): Promise<string> {
  const response = await call('POST', '/api/clients', {
    cookie,
    body: { fullName, identification: null, phone: '8888-0000', email: null, address: null, references: [], notes: null, status: 'active' },
  });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as { clientId: string };
  return payload.clientId;
}

async function createLoan(cookie: string, clientId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const response = await call('POST', '/api/loans', {
    cookie,
    body: {
      clientId,
      currency: 'NIO',
      principalCents: 100_000,
      interestRateBps: 0,
      amortizationMethod: 'flat_interest',
      installmentCount: 2,
      frequency: 'monthly',
      customDays: null,
      disbursementDate: today,
      firstDueDate: addMonths(today, 1),
      feeCents: 0,
      lateFeeDailyBps: 0,
      graceDays: 0,
      notes: null,
    },
  });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as { loanId: string };
  return payload.loanId;
}

describe('aislamiento multi-tenant', () => {
  it('no permite acceder a clientes ni préstamos de otra organización', async () => {
    const alice = await registerVerifiedUser('alice', '10.0.0.10');
    const bob = await registerVerifiedUser('bob', '10.0.0.11');

    const aliceOrg = await createOrganization(alice.cookie, 'Financiera Alfa');
    const bobOrg = await createOrganization(bob.cookie, 'Financiera Beta');
    expect(aliceOrg).not.toBe(bobOrg);

    const aliceClient = await createClient(alice.cookie, 'Cliente de Alfa');
    const bobClient = await createClient(bob.cookie, 'Cliente de Beta');
    const bobLoan = await createLoan(bob.cookie, bobClient);

    const crossClient = await call('GET', `/api/clients/${bobClient}`, { cookie: alice.cookie });
    expect(crossClient.status).toBe(404);

    const crossLoanLookup = await call('GET', `/api/loans/${bobLoan}`, { cookie: alice.cookie });
    expect(crossLoanLookup.status).toBe(404);

    const crossLoanCreate = await call('POST', '/api/loans', {
      cookie: alice.cookie,
      body: {
        clientId: bobClient,
        currency: 'NIO',
        principalCents: 50_000,
        interestRateBps: 0,
        amortizationMethod: 'flat_interest',
        installmentCount: 1,
        frequency: 'monthly',
        disbursementDate: new Date().toISOString().slice(0, 10),
        firstDueDate: addMonths(new Date().toISOString().slice(0, 10), 1),
        feeCents: 0,
        lateFeeDailyBps: 0,
        graceDays: 0,
      },
    });
    expect(crossLoanCreate.status).toBe(404);

    const ownClient = await call('GET', `/api/clients/${aliceClient}`, { cookie: alice.cookie });
    expect(ownClient.status).toBe(200);
  });

  it('rechaza el acceso sin sesión y a rutas de administración de plataforma', async () => {
    const anonymous = await call('GET', '/api/clients');
    expect(anonymous.status).toBe(401);

    const user = await registerVerifiedUser('carol', '10.0.0.12');
    await createOrganization(user.cookie, 'Financiera Gamma');

    const admin = await call('GET', '/api/admin/overview', { cookie: user.cookie });
    expect(admin.status).toBe(404);
  });
});

describe('ciclo de pagos', () => {
  it('aplica pagos, liquida el préstamo y reversa con trazabilidad', async () => {
    const user = await registerVerifiedUser('diego', '10.0.0.20');
    await createOrganization(user.cookie, 'Financiera Delta');
    const clientId = await createClient(user.cookie, 'Cliente de Delta');
    const loanId = await createLoan(user.cookie, clientId);

    const today = new Date().toISOString().slice(0, 10);

    const firstPayment = await call('POST', '/api/payments', {
      cookie: user.cookie,
      body: { loanId, amountCents: 50_000, method: 'cash', paidAt: today, mode: 'regular' },
    });
    expect(firstPayment.status).toBe(201);
    const firstPayload = (await firstPayment.json()) as { paymentId: string; loanSettled: boolean };
    expect(firstPayload.loanSettled).toBe(false);

    const afterFirst = (await (await call('GET', `/api/loans/${loanId}`, { cookie: user.cookie })).json()) as {
      loan: { metrics: { outstandingCents: number; paidCents: number } };
      installments: Array<{ status: string }>;
    };
    expect(afterFirst.loan.metrics.outstandingCents).toBe(50_000);
    expect(afterFirst.loan.metrics.paidCents).toBe(50_000);
    expect(afterFirst.installments[0]?.status).toBe('paid');
    expect(afterFirst.installments[1]?.status).toBe('pending');

    const overpayment = await call('POST', '/api/payments', {
      cookie: user.cookie,
      body: { loanId, amountCents: 60_000, method: 'cash', paidAt: today, mode: 'regular' },
    });
    expect(overpayment.status).toBe(400);

    const secondPayment = await call('POST', '/api/payments', {
      cookie: user.cookie,
      body: { loanId, amountCents: 50_000, method: 'transfer', paidAt: today, mode: 'regular' },
    });
    expect(secondPayment.status).toBe(201);

    const settled = (await (await call('GET', `/api/loans/${loanId}`, { cookie: user.cookie })).json()) as {
      loan: { status: string; metrics: { outstandingCents: number } };
    };
    expect(settled.loan.status).toBe('settled');
    expect(settled.loan.metrics.outstandingCents).toBe(0);

    const reversed = await call('POST', `/api/payments/${firstPayload.paymentId}/reverse`, {
      cookie: user.cookie,
      body: { reason: 'Pago duplicado detectado en conciliación' },
    });
    expect(reversed.status).toBe(200);

    const afterReverse = (await (await call('GET', `/api/loans/${loanId}`, { cookie: user.cookie })).json()) as {
      loan: { status: string; metrics: { outstandingCents: number } };
      installments: Array<{ status: string }>;
      payments: Array<{ status: string }>;
    };
    expect(afterReverse.loan.status).toBe('active');
    expect(afterReverse.loan.metrics.outstandingCents).toBe(50_000);
    expect(afterReverse.installments[0]?.status).not.toBe('paid');
    expect(afterReverse.payments.some((payment) => payment.status === 'reversed')).toBe(true);
  });

  it('no registra pagos en préstamos cancelados', async () => {
    const user = await registerVerifiedUser('elena', '10.0.0.21');
    await createOrganization(user.cookie, 'Financiera Épsilon');
    const clientId = await createClient(user.cookie, 'Cliente de Épsilon');
    const loanId = await createLoan(user.cookie, clientId);

    const cancelled = await call('POST', `/api/loans/${loanId}/cancel`, {
      cookie: user.cookie,
      body: { reason: 'Préstamo creado por error en prueba' },
    });
    expect(cancelled.status).toBe(200);

    const payment = await call('POST', '/api/payments', {
      cookie: user.cookie,
      body: { loanId, amountCents: 1000, method: 'cash', paidAt: new Date().toISOString().slice(0, 10), mode: 'regular' },
    });
    expect(payment.status).toBe(409);
  });
});
