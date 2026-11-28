import type { Db } from '../db';
import { PricingError, type PlanCatalog } from '../../shared/billing/pricing';
import { listAddons, listModules } from '../repositories/catalog';
import { getPlanByKey, getPlanLimits } from '../repositories/subscriptions';

/** Carga el catálogo efectivo de un plan: límites, módulos incluidos y complementos disponibles. */
export async function loadPlanCatalog(db: Db, planKey: string): Promise<PlanCatalog> {
  const plan = await getPlanByKey(db, planKey);
  if (!plan || plan.is_active !== 1) {
    throw new PricingError('plan_not_found', 'El plan solicitado no está disponible.', { planKey });
  }

  const [limits, modules, addons] = await Promise.all([
    getPlanLimits(db, plan.id),
    listModules(db),
    listAddons(db),
  ]);

  return {
    plan: {
      key: plan.key,
      name: plan.name,
      currency: plan.currency,
      priceMonthlyCents: plan.price_monthly_cents,
      priceYearlyCents: plan.price_yearly_cents,
      limits,
    },
    includedModuleKeys: modules
      .filter((module) => module.is_active === 1 && module.planKeys.includes(plan.key))
      .map((module) => module.key),
    modules: modules.map((module) => ({
      key: module.key,
      name: module.name,
      priceMonthlyCents: module.price_monthly_cents,
      priceYearlyCents: module.price_yearly_cents,
      isCore: module.is_core === 1,
      isActive: module.is_active === 1,
      dependencyKeys: module.dependencyKeys,
    })),
    addons: addons.map((addon) => ({
      key: addon.key,
      name: addon.name,
      metric: addon.metric,
      unitAmount: addon.unit_amount,
      priceMonthlyCents: addon.price_monthly_cents,
      priceYearlyCents: addon.price_yearly_cents,
      isActive: addon.is_active === 1,
      maxQuantity: addon.plans.find((item) => item.planKey === plan.key)?.maxQuantity ?? 0,
    })),
  };
}
