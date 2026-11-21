import type { Db } from '../db';
import { AppError } from '../lib/errors';
import { getOrgUsage, getSubscription, getPlanLimits } from '../repositories/subscriptions';

export const LIMIT_LABELS: Record<string, string> = {
  users: 'Usuarios',
  clients: 'Clientes',
  active_loans: 'Préstamos activos',
  storage_mb: 'Almacenamiento (MB)',
  collectors: 'Cobradores',
  branches: 'Sucursales',
  exports_per_month: 'Exportaciones por mes',
  history_days: 'Días de historial',
};

export type LimitMetric = 'users' | 'clients' | 'active_loans' | 'storage_mb' | 'collectors' | 'branches';

export interface LimitState {
  planKey: string;
  limits: Record<string, number>;
  usage: Record<string, number>;
}

/**
 * Motor centralizado de límites: los valores viven en la base de datos
 * (planes y plan_limits), nunca dispersos en el código.
 */
export async function getLimitState(db: Db, orgId: string): Promise<LimitState> {
  const subscription = await getSubscription(db, orgId);
  if (!subscription) {
    return { planKey: 'none', limits: {}, usage: {} };
  }

  const limits = await getPlanLimits(db, subscription.plan.id);
  const orgUsage = await getOrgUsage(db, orgId);

  return {
    planKey: subscription.plan.key,
    limits,
    usage: {
      users: orgUsage.members,
      clients: orgUsage.clients,
      active_loans: orgUsage.activeLoans,
      collectors: orgUsage.collectors,
      storage_mb: Math.ceil(orgUsage.storageBytes / (1024 * 1024)),
      branches: 0,
    },
  };
}

export async function assertCanAdd(db: Db, orgId: string, metric: LimitMetric, amount = 1): Promise<void> {
  const state = await getLimitState(db, orgId);
  const limit = state.limits[metric];

  // -1 o ausente significa ilimitado.
  if (limit === undefined || limit < 0) return;

  const current = state.usage[metric] ?? 0;
  if (current + amount > limit) {
    const label = LIMIT_LABELS[metric] ?? metric;
    throw AppError.limitExceeded(
      `Alcanzaste el límite de ${label.toLowerCase()} de tu plan (${limit}). Actualiza tu plan para continuar.`,
      { metric, limit, current, planKey: state.planKey },
    );
  }
}

export async function assertWithinLimit(db: Db, orgId: string, metric: LimitMetric, nextValue: number): Promise<void> {
  const state = await getLimitState(db, orgId);
  const limit = state.limits[metric];
  if (limit === undefined || limit < 0) return;
  if (nextValue > limit) {
    const label = LIMIT_LABELS[metric] ?? metric;
    throw AppError.limitExceeded(`Superaste el límite de ${label.toLowerCase()} de tu plan (${limit}).`, {
      metric,
      limit,
      current: nextValue,
      planKey: state.planKey,
    });
  }
}

/** Una suscripción expirada conserva datos pero entra en modo lectura. */
export function assertSubscriptionWritable(status: string): void {
  if (status === 'expired' || status === 'canceled') {
    throw new AppError(
      'subscription_inactive',
      402,
      'Tu suscripción está inactiva. Reactiva tu plan para seguir operando; tus datos permanecen seguros.',
    );
  }
}
