export type BillingCycle = 'monthly' | 'yearly';

export type PricingErrorCode =
  | 'plan_not_found'
  | 'module_not_found'
  | 'module_inactive'
  | 'dependency_missing'
  | 'core_module_required'
  | 'addon_not_found'
  | 'addon_inactive'
  | 'addon_duplicate'
  | 'addon_not_available'
  | 'addon_quantity_invalid'
  | 'addon_quantity_exceeded';

export class PricingError extends Error {
  constructor(
    readonly code: PricingErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'PricingError';
  }
}

export interface PlanPrice {
  key: string;
  name: string;
  currency: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  limits: Record<string, number>;
}

export interface ModulePrice {
  key: string;
  name: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  isCore: boolean;
  isActive: boolean;
  dependencyKeys: string[];
}

export interface AddonPrice {
  key: string;
  name: string;
  metric: string;
  unitAmount: number;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  isActive: boolean;
  maxQuantity: number;
}

export interface PlanCatalog {
  plan: PlanPrice;
  includedModuleKeys: string[];
  modules: ModulePrice[];
  addons: AddonPrice[];
}

export interface SubscriptionConfig {
  planKey: string;
  billingCycle: BillingCycle;
  moduleKeys: string[];
  addons: Array<{ key: string; quantity: number }>;
}

export interface QuoteLine {
  kind: 'plan' | 'module' | 'addon';
  key: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
}

export interface AddonLimit {
  metric: string;
  unitAmount: number;
  quantity: number;
  totalAmount: number;
}

export interface SubscriptionQuote {
  currency: string;
  billingCycle: BillingCycle;
  planKey: string;
  lines: QuoteLine[];
  includedModuleKeys: string[];
  addonLimits: AddonLimit[];
  totalCents: number;
  monthlyEquivalentCents: number;
  discountCents: number;
  effectiveLimits: Record<string, number>;
}

function priceFor(cycle: BillingCycle, monthly: number, yearly: number): number {
  return cycle === 'yearly' ? yearly : monthly;
}

/** Suma complementos a los límites del plan. `-1` se mantiene ilimitado. */
export function applyAddonLimits(
  limits: Record<string, number>,
  addons: Array<{ metric: string; unitAmount: number; quantity: number }>,
): Record<string, number> {
  const result = { ...limits };

  for (const addon of addons) {
    const base = result[addon.metric];
    const added = addon.unitAmount * addon.quantity;
    result[addon.metric] = base === undefined || base < 0 ? (base ?? added) : base + added;
  }

  return result;
}

export function quoteSubscription(catalog: PlanCatalog, config: SubscriptionConfig): SubscriptionQuote {
  if (catalog.plan.key !== config.planKey) {
    throw new PricingError('plan_not_found', 'El plan solicitado no existe.', { planKey: config.planKey });
  }

  const included = new Set(catalog.includedModuleKeys);
  const modulesByKey = new Map(catalog.modules.map((module) => [module.key, module]));

  const requestedModules = Array.from(new Set(config.moduleKeys));
  for (const key of requestedModules) {
    const module = modulesByKey.get(key);
    if (!module) throw new PricingError('module_not_found', 'El módulo no existe.', { moduleKey: key });
    if (!module.isActive) throw new PricingError('module_inactive', 'El módulo no está disponible.', { moduleKey: key });
  }

  // La configuración efectiva (incluidos + seleccionados) debe satisfacer las dependencias.
  const activeModules = new Set<string>([...included, ...requestedModules]);
  for (const key of activeModules) {
    const module = modulesByKey.get(key);
    if (!module) continue;
    for (const dependency of module.dependencyKeys) {
      if (!activeModules.has(dependency)) {
        throw new PricingError('dependency_missing', `El módulo ${module.name} requiere ${dependency}.`, {
          moduleKey: key,
          dependencyKey: dependency,
        });
      }
    }
  }

  for (const module of catalog.modules) {
    if (module.isCore && module.isActive && !activeModules.has(module.key)) {
      throw new PricingError('core_module_required', `El módulo ${module.name} es obligatorio.`, {
        moduleKey: module.key,
      });
    }
  }

  const planUnit = priceFor(config.billingCycle, catalog.plan.priceMonthlyCents, catalog.plan.priceYearlyCents);
  const lines: QuoteLine[] = [
    { kind: 'plan', key: catalog.plan.key, quantity: 1, unitCents: planUnit, totalCents: planUnit },
  ];

  const optionalModules = requestedModules.filter((key) => !included.has(key));
  for (const key of optionalModules) {
    const module = modulesByKey.get(key) as ModulePrice;
    const unitCents = priceFor(config.billingCycle, module.priceMonthlyCents, module.priceYearlyCents);
    lines.push({ kind: 'module', key, quantity: 1, unitCents, totalCents: unitCents });
  }

  const addonsByKey = new Map(catalog.addons.map((addon) => [addon.key, addon]));
  const seenAddons = new Set<string>();
  const addonLimits: AddonLimit[] = [];

  for (const item of config.addons) {
    if (seenAddons.has(item.key)) {
      throw new PricingError('addon_duplicate', 'El complemento está repetido.', { addonKey: item.key });
    }
    seenAddons.add(item.key);

    const addon = addonsByKey.get(item.key);
    if (!addon) throw new PricingError('addon_not_found', 'El complemento no existe.', { addonKey: item.key });
    if (!addon.isActive) {
      throw new PricingError('addon_inactive', 'El complemento no está disponible.', { addonKey: item.key });
    }
    if (addon.maxQuantity <= 0) {
      throw new PricingError('addon_not_available', 'El complemento no aplica a este plan.', {
        addonKey: item.key,
        planKey: config.planKey,
      });
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new PricingError('addon_quantity_invalid', 'La cantidad del complemento debe ser mayor que cero.', {
        addonKey: item.key,
      });
    }
    if (item.quantity > addon.maxQuantity) {
      throw new PricingError(
        'addon_quantity_exceeded',
        `El máximo de ${addon.name} para este plan es ${addon.maxQuantity}.`,
        { addonKey: item.key, maxQuantity: addon.maxQuantity, quantity: item.quantity },
      );
    }

    const unitCents = priceFor(config.billingCycle, addon.priceMonthlyCents, addon.priceYearlyCents);
    lines.push({ kind: 'addon', key: item.key, quantity: item.quantity, unitCents, totalCents: unitCents * item.quantity });

    addonLimits.push({
      metric: addon.metric,
      unitAmount: addon.unitAmount,
      quantity: item.quantity,
      totalAmount: addon.unitAmount * item.quantity,
    });
  }

  const effectiveLimits = applyAddonLimits(catalog.plan.limits, addonLimits);

  const totalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const monthlyTotal =
    catalog.plan.priceMonthlyCents +
    optionalModules.reduce((sum, key) => sum + (modulesByKey.get(key)?.priceMonthlyCents ?? 0), 0) +
    config.addons.reduce((sum, item) => sum + (addonsByKey.get(item.key)?.priceMonthlyCents ?? 0) * item.quantity, 0);
  const monthlyEquivalentCents = config.billingCycle === 'yearly' ? monthlyTotal * 12 : totalCents;
  const discountCents = config.billingCycle === 'yearly' ? Math.max(0, monthlyEquivalentCents - totalCents) : 0;

  return {
    currency: catalog.plan.currency,
    billingCycle: config.billingCycle,
    planKey: catalog.plan.key,
    lines,
    includedModuleKeys: Array.from(included),
    addonLimits,
    totalCents,
    monthlyEquivalentCents,
    discountCents,
    effectiveLimits,
  };
}
