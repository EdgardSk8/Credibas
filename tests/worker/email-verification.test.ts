import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/worker/app';
import type { Env } from '../../src/worker/env';

const BASE = 'http://localhost';
const PASSWORD = 'Credibas2026x';

interface CallOptions {
  ip?: string;
  body?: unknown;
}

async function call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  headers['cf-connecting-ip'] = options.ip ?? '10.9.0.1';

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

function captureVerificationCode(): { calls: string[] } {
  const calls: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    calls.push(args.join(' '));
  });
  return { calls };
}

function codeFrom(calls: string[]): string {
  const line = calls.find((value) => value.includes('código de verificación de Credibas es'));
  const match = line ? /es (\d{6})/.exec(line) : null;
  if (!match?.[1]) throw new Error('El correo de verificación no se imprimió en consola');
  return match[1];
}

async function register(email: string, ip: string): Promise<void> {
  const response = await call('POST', '/api/auth/register', {
    ip,
    body: { fullName: 'Persona Código', email, password: PASSWORD, acceptTerms: true },
  });
  expect(response.status).toBe(201);
}

describe('verificación de correo con código', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registra, envía el código, lo confirma y permite iniciar sesión', async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `codigo-${suffix}@credibas.test`;
    const ip = '10.9.1.1';

    const { calls } = captureVerificationCode();
    await register(email, ip);
    const code = codeFrom(calls);

    const wrong = await call('POST', '/api/auth/verify-email-code', {
      ip,
      body: { email, code: code === '000000' ? '111111' : '000000' },
    });
    expect(wrong.status).toBe(400);

    const verified = await call('POST', '/api/auth/verify-email-code', { ip, body: { email, code } });
    expect(verified.status).toBe(200);

    const login = await call('POST', '/api/auth/login', { ip, body: { email, password: PASSWORD } });
    expect(login.status).toBe(200);
  });

  it('no reenvía el código antes de 60 segundos', async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `cooldown-${suffix}@credibas.test`;
    const ip = '10.9.2.1';

    const { calls } = captureVerificationCode();
    await register(email, ip);
    codeFrom(calls);

    const resend = await call('POST', '/api/auth/resend-verification', { ip, body: { email } });
    expect(resend.status).toBe(429);
  });

  it('no revela si el correo existe al reenviar', async () => {
    const resend = await call('POST', '/api/auth/resend-verification', {
      ip: '10.9.3.1',
      body: { email: 'no-existe@credibas.test' },
    });
    expect(resend.status).toBe(200);
  });
});
