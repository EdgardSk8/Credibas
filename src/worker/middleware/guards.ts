import { createMiddleware } from 'hono/factory';
import { AppError } from '../lib/errors';
import type { Permission } from '../../shared/rbac';
import type { AppEnv } from '../types';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('userId')) throw AppError.unauthorized();
  await next();
});

export const requireVerifiedEmail = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('userId')) throw AppError.unauthorized();
  if (!c.get('emailVerified')) {
    throw new AppError('email_not_verified', 403, 'Confirma tu correo para continuar');
  }
  await next();
});

export const requireOrg = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('orgId')) {
    throw new AppError('organization_required', 409, 'Crea o selecciona un negocio para continuar');
  }
  await next();
});

export function requirePermission(permission: Permission) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get('userId')) throw AppError.unauthorized();
    const permissions = c.get('permissions') ?? [];
    if (!permissions.includes(permission)) {
      throw AppError.forbidden(`Tu rol no tiene el permiso "${permission}"`);
    }
    await next();
  });
}

export const requirePlatformAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('userId')) throw AppError.unauthorized();
  // La demo pública nunca entra al panel de plataforma.
  if (c.get('isDemo')) throw AppError.notFound('No encontramos esta página');
  if (!c.get('isPlatformAdmin')) throw AppError.notFound('No encontramos esta página');
  await next();
});

/**
 * La demo pública es de solo lectura: se permiten GET/HEAD y cerrar sesión.
 * Cualquier otra escritura se rechaza en el servidor, no solo en la interfaz.
 */
export const blockDemoWrites = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    await next();
    return;
  }
  if (!c.get('isDemo')) {
    await next();
    return;
  }
  if (new URL(c.req.url).pathname === '/api/auth/logout') {
    await next();
    return;
  }
  // Volver a pedir la demo solo renueva la sesión de solo lectura.
  if (new URL(c.req.url).pathname === '/api/public/demo') {
    await next();
    return;
  }
  throw new AppError(
    'demo_read_only',
    403,
    'La demo es de solo lectura. Crea tu cuenta para trabajar con tus propios datos.',
  );
});
