import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { dbFrom } from '../../src/worker/db';
import {
  createModule,
  listAddons,
  listModules,
  updateModule,
  type ModuleInput,
} from '../../src/worker/repositories/catalog';
import type { Env } from '../../src/worker/env';

const db = () => dbFrom((env as unknown as Env).DB);

const baseModule: ModuleInput = {
  key: 'qa_temp',
  name: 'Módulo temporal',
  description: null,
  priceMonthlyCents: 100,
  priceYearlyCents: 1000,
  isCore: false,
  isActive: true,
  sortOrder: 999,
  features: ['Prueba'],
  dependencyKeys: ['core'],
  planKeys: ['starter'],
};

describe('catálogo de módulos y complementos', () => {
  it('siembra los módulos con sus planes y dependencias', async () => {
    const modules = await listModules(db());
    expect(modules.map((module) => module.key).sort()).toEqual([
      'cash',
      'clients',
      'collections',
      'core',
      'reports',
      'team',
    ]);

    const core = modules.find((module) => module.key === 'core');
    expect(core?.is_core).toBe(1);
    expect(core?.dependencyKeys).toEqual(['clients']);
    expect(core?.planKeys.sort()).toEqual(['business', 'professional', 'starter', 'trial']);
  });

  it('siembra los complementos con topes por plan', async () => {
    const addons = await listAddons(db());
    const clients = addons.find((addon) => addon.key === 'clients_500');
    expect(clients?.unit_amount).toBe(500);
    expect(
      clients?.plans.slice().sort((a, b) => a.planKey.localeCompare(b.planKey)),
    ).toEqual([
      { planKey: 'business', maxQuantity: 10 },
      { planKey: 'professional', maxQuantity: 5 },
      { planKey: 'starter', maxQuantity: 3 },
    ]);

    const branch = addons.find((addon) => addon.key === 'branch_1');
    expect(branch?.is_active).toBe(0);
    expect(branch?.plans).toEqual([]);
  });

  it('crea y edita un módulo sin alterar los planes base', async () => {
    const id = await createModule(db(), baseModule, Date.now());

    let modules = await listModules(db());
    const created = modules.find((module) => module.id === id);
    expect(created?.key).toBe('qa_temp');
    expect(created?.is_active).toBe(1);
    expect(created?.dependencyKeys).toEqual(['core']);
    expect(created?.planKeys).toEqual(['starter']);

    await updateModule(db(), id, { ...baseModule, priceMonthlyCents: 250, isActive: false }, Date.now());

    modules = await listModules(db());
    const updated = modules.find((module) => module.id === id);
    expect(updated?.price_monthly_cents).toBe(250);
    expect(updated?.is_active).toBe(0);
  });
});
