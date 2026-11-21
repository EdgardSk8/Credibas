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
  if (!c.get('isPlatformAdmin')) throw AppError.notFound('No encontramos esta página');
  await next();
});
