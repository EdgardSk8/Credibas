import { describe, expect, it } from 'vitest';
import { PricingError, applyAddonLimits, quoteSubscription, type PlanCatalog } from '../../src/shared/billing/pricing';

function makeCatalog(overrides: Partial<PlanCatalog> = {}): PlanCatalog {
  return {
    plan: {
      key: 'professional',
      name: 'Professional',
      currency: 'USD',
      priceMonthlyCents: 2490,
      priceYearlyCents: 24900,
      limits: { users: 5, clients: 2000, active_loans: 1000, storage_mb: 2048, branches: 2 },
    },
    includedModuleKeys: ['core', 'clients', 'reports'],
    modules: [
      { key: 'core', name: 'Operación', priceMonthlyCents: 0, priceYearlyCents: 0, isCore: true, isActive: true, dependencyKeys: ['clients'] },
      { key: 'clients', name: 'Clientes', priceMonthlyCents: 0, priceYearlyCents: 0, isCore: true, isActive: true, dependencyKeys: [] },
      { key: 'reports', name: 'Reportes', priceMonthlyCents: 500, priceYearlyCents: 5000, isCore: false, isActive: true, dependencyKeys: ['core'] },
      { key: 'collections', name: 'Cobranza', priceMonthlyCents: 500, priceYearlyCents: 5000, isCore: false, isActive: true, dependencyKeys: ['core'] },
      { key: 'legacy', name: 'Legado', priceMonthlyCents: 100, priceYearlyCents: 1000, isCore: false, isActive: false, dependencyKeys: ['core'] },
    ],
    addons: [
      { key: 'clients_500', name: '+500 clientes', metric: 'clients', unitAmount: 500, priceMonthlyCents: 300, priceYearlyCents: 3000, isActive: true, maxQuantity: 5 },
      { key: 'branch_1', name: '+1 sucursal', metric: 'branches', unitAmount: 1, priceMonthlyCents: 500, priceYearlyCents: 5000, isActive: true, maxQuantity: 0 },
      { key: 'history_180', name: 'Historial', metric: 'history_days', unitAmount: 180, priceMonthlyCents: 300, priceYearlyCents: 3000, isActive: false, maxQuantity: 3 },
    ],
    ...overrides,
  };
}

const baseConfig = { planKey: 'professional', billingCycle: 'monthly' as const, moduleKeys: [], addons: [] };

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof PricingError ? error.code : 'other';
  }
}

describe('motor de precios', () => {
  it('cobra solo el plan base cuando no hay módulos opcionales', () => {
    const quote = quoteSubscription(makeCatalog(), baseConfig);

    expect(quote.totalCents).toBe(2490);
    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0]).toMatchObject({ kind: 'plan', key: 'professional', unitCents: 2490 });
    expect(quote.includedModuleKeys.sort()).toEqual(['clients', 'core', 'reports']);
    expect(quote.effectiveLimits.clients).toBe(2000);
    expect(quote.discountCents).toBe(0);
  });

  it('suma módulos opcionales y no cobra los incluidos', () => {
    const withOptional = quoteSubscription(makeCatalog(), { ...baseConfig, moduleKeys: ['collections'] });
    expect(withOptional.totalCents).toBe(2490 + 500);
    expect(withOptional.lines.map((line) => line.kind)).toEqual(['plan', 'module']);

    const withIncluded = quoteSubscription(makeCatalog(), { ...baseConfig, moduleKeys: ['reports'] });
    expect(withIncluded.totalCents).toBe(2490);
    expect(withIncluded.lines).toHaveLength(1);
  });

  it('multiplica complementos y amplía los límites efectivos', () => {
    const quote = quoteSubscription(makeCatalog(), {
      ...baseConfig,
      addons: [{ key: 'clients_500', quantity: 2 }],
    });

    expect(quote.totalCents).toBe(2490 + 300 * 2);
    expect(quote.effectiveLimits.clients).toBe(2000 + 500 * 2);
    expect(quote.addonLimits).toEqual([{ metric: 'clients', unitAmount: 500, quantity: 2, totalAmount: 1000 }]);
  });

  it('calcula el anual y el descuento frente al mensual', () => {
    const quote = quoteSubscription(makeCatalog(), {
      planKey: 'professional',
      billingCycle: 'yearly',
      moduleKeys: ['collections'],
      addons: [],
    });

    expect(quote.totalCents).toBe(24900 + 5000);
    expect(quote.monthlyEquivalentCents).toBe((2490 + 500) * 12);
    expect(quote.discountCents).toBe(5980);
  });

  it('suma complementos a los límites y respeta el ilimitado', () => {
    expect(
      applyAddonLimits(
        { clients: 2000, storage_mb: -1 },
        [
          { metric: 'clients', unitAmount: 500, quantity: 2 },
          { metric: 'storage_mb', unitAmount: 5120, quantity: 1 },
        ],
      ),
    ).toEqual({ clients: 3000, storage_mb: -1 });

    expect(applyAddonLimits({}, [{ metric: 'users', unitAmount: 1, quantity: 2 }])).toEqual({ users: 2 });
  });

  it('rechaza configuraciones inválidas', () => {
    expect(codeOf(() => quoteSubscription(makeCatalog({ includedModuleKeys: ['clients'] }), { ...baseConfig, moduleKeys: ['collections'] }))).toBe('dependency_missing');
    expect(codeOf(() => quoteSubscription(makeCatalog({ includedModuleKeys: [] }), baseConfig))).toBe('core_module_required');
    expect(codeOf(() => quoteSubscription(makeCatalog({ includedModuleKeys: ['core'] }), baseConfig))).toBe('dependency_missing');
    expect(codeOf(() => quoteSubscription(makeCatalog(), { ...baseConfig, moduleKeys: ['legacy'] }))).toBe('module_inactive');
    expect(codeOf(() => quoteSubscription(makeCatalog(), { ...baseConfig, moduleKeys: ['nope'] }))).toBe('module_not_found');
  });

  it('rechaza complementos inválidos', () => {
    expect(codeOf(() => quoteSubscription(makeCatalog(), { ...baseConfig, addons: [{ key: 'nope', quantity: 1 }] }))).toBe('addon_not_found');
    expect(codeOf(() => quoteSubscription(makeCatalog(), { ...baseConfig, addons: [{ key: 'history_180', quantity: 1 }] }))).toBe('addon_inactive');
    expect(codeOf(() => quoteSubscription(makeCatalog(), { ...baseConfig, addons: [{ key: 'branch_1', quantity: 1 }] }))).toBe('addon_not_available');
    expect(codeOf(() => quoteSubscription(makeCatalog(), { ...baseConfig, addons: [{ key: 'clients_500', quantity: 6 }] }))).toBe('addon_quantity_exceeded');
    expect(codeOf(() => quoteSubscription(makeCatalog(), { ...baseConfig, addons: [{ key: 'clients_500', quantity: 0 }] }))).toBe('addon_quantity_invalid');
    expect(codeOf(() => quoteSubscription(makeCatalog(), { ...baseConfig, addons: [{ key: 'clients_500', quantity: 1 }, { key: 'clients_500', quantity: 1 }] }))).toBe('addon_duplicate');
  });
});
