import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { AppError, toAppError } from '../lib/errors';
import type { AppEnv } from '../types';
import type { ZodType } from 'zod';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const requestIdMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  c.set('clientIp', c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip') ?? '0.0.0.0');
  await next();
  c.header('x-request-id', c.get('requestId'));
});

/**
 * Protección CSRF para endpoints con cookie de sesión: exige que el origen
 * de las peticiones mutables coincida con el host de la aplicación.
 */
export const csrfMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (!UNSAFE_METHODS.has(c.req.method) || c.req.path.startsWith('/api/webhooks/')) {
    await next();
    return;
  }

  const origin = c.req.header('origin');
  const referer = c.req.header('referer');
  const host = c.req.header('host');

  const allowed = new Set<string>();
  if (host) allowed.add(host.toLowerCase());
  try {
    allowed.add(new URL(c.env.APP_URL).host.toLowerCase());
  } catch {
    // APP_URL inválida: se ignora y solo se valida contra el host real.
  }

  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      throw AppError.forbidden('Origen inválido');
    }
    if (!allowed.has(originHost)) throw AppError.forbidden('Origen no permitido');
  } else if (referer) {
    try {
      if (!allowed.has(new URL(referer).host.toLowerCase())) throw AppError.forbidden('Origen no permitido');
    } catch {
      throw AppError.forbidden('Origen inválido');
    }
  }

  await next();
});

export function errorHandler(error: unknown, c: Context<AppEnv>) {
  const appError = toAppError(error);

  if (appError.status >= 500) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[${c.get('requestId') ?? 'no-request-id'}] ${c.req.method} ${c.req.path} :: ${detail}`);
  }

  return c.json(
    { error: { code: appError.code, message: appError.message, details: appError.details } },
    appError.status as 400,
  );
}

/** Valida y normaliza el cuerpo JSON. */
export async function parseBody<T>(c: Context<AppEnv>, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw AppError.badRequest('El cuerpo de la solicitud no es JSON válido');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw AppError.badRequest('Revisa los datos del formulario', result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })));
  }
  return result.data;
}

export function parseQuery<T>(c: Context<AppEnv>, schema: ZodType<T>): T {
  const query: Record<string, string> = {};
  for (const [key, value] of new URL(c.req.url).searchParams.entries()) query[key] = value;

  const result = schema.safeParse(query);
  if (!result.success) {
    throw AppError.badRequest('Parámetros de consulta inválidos', result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })));
  }
  return result.data;
}

export function paginated<T>(items: T[], page: number, pageSize: number, total: number) {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
