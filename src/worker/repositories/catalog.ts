import type { Db } from '../db';
import { newId } from '../lib/crypto';

export interface ModuleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  is_core: number;
  is_active: number;
  sort_order: number;
  features_json: string;
  created_at: number;
  updated_at: number;
}

export interface AddonRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  metric: string;
  unit_amount: number;
  unit_label: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  is_active: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface CatalogModule extends ModuleRow {
  dependencyKeys: string[];
  planKeys: string[];
}

export interface CatalogAddon extends AddonRow {
  plans: Array<{ planKey: string; maxQuantity: number }>;
}

export interface ModuleInput {
  key: string;
  name: string;
  description?: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  isCore: boolean;
  isActive: boolean;
  sortOrder: number;
  features: string[];
  dependencyKeys: string[];
  planKeys: string[];
}

export interface AddonInput {
  key: string;
  name: string;
  description?: string | null;
  metric: string;
  unitAmount: number;
  unitLabel: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  isActive: boolean;
  sortOrder: number;
  plans: Array<{ planKey: string; maxQuantity: number }>;
}

const MODULE_COLUMNS = `id, key, name, description, price_monthly_cents, price_yearly_cents, currency,
  is_core, is_active, sort_order, features_json, created_at, updated_at`;

const ADDON_COLUMNS = `id, key, name, description, metric, unit_amount, unit_label, price_monthly_cents,
  price_yearly_cents, currency, is_active, sort_order, created_at, updated_at`;

export async function listModules(db: Db): Promise<CatalogModule[]> {
  const modules = await db.all<ModuleRow>(`SELECT ${MODULE_COLUMNS} FROM modules ORDER BY sort_order ASC, name ASC`);
  const dependencies = await db.all<{ module_id: string; dependency_key: string }>(
    `SELECT d.module_id, m.key AS dependency_key
       FROM module_dependencies d JOIN modules m ON m.id = d.depends_on_module_id`,
  );
  const plans = await db.all<{ module_id: string; plan_key: string }>(
    `SELECT pm.module_id, p.key AS plan_key
       FROM plan_modules pm JOIN plans p ON p.id = pm.plan_id
      WHERE pm.included = 1`,
  );

  return modules.map((module) => ({
    ...module,
    dependencyKeys: dependencies.filter((row) => row.module_id === module.id).map((row) => row.dependency_key),
    planKeys: plans.filter((row) => row.module_id === module.id).map((row) => row.plan_key),
  }));
}

export async function listAddons(db: Db): Promise<CatalogAddon[]> {
  const addons = await db.all<AddonRow>(`SELECT ${ADDON_COLUMNS} FROM addons ORDER BY sort_order ASC, name ASC`);
  const plans = await db.all<{ addon_id: string; plan_key: string; max_quantity: number }>(
    `SELECT pa.addon_id, p.key AS plan_key, pa.max_quantity
       FROM plan_addons pa JOIN plans p ON p.id = pa.plan_id`,
  );

  return addons.map((addon) => ({
    ...addon,
    plans: plans
      .filter((row) => row.addon_id === addon.id)
      .map((row) => ({ planKey: row.plan_key, maxQuantity: Number(row.max_quantity) })),
  }));
}

export async function getModuleById(db: Db, id: string): Promise<ModuleRow | null> {
  return db.first<ModuleRow>(`SELECT ${MODULE_COLUMNS} FROM modules WHERE id = ?`, [id]);
}

export async function getAddonById(db: Db, id: string): Promise<AddonRow | null> {
  return db.first<AddonRow>(`SELECT ${ADDON_COLUMNS} FROM addons WHERE id = ?`, [id]);
}

async function resolveIds(db: Db, table: 'modules' | 'plans', keys: string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const placeholders = keys.map(() => '?').join(', ');
  const rows = await db.all<{ id: string; key: string }>(
    `SELECT id, key FROM ${table} WHERE key IN (${placeholders})`,
    keys,
  );
  return new Map(rows.map((row) => [row.key, row.id]));
}

export async function createModule(db: Db, input: ModuleInput, now: number): Promise<string> {
  const id = newId('mod');
  const dependencyIds = await resolveIds(db, 'modules', input.dependencyKeys);
  const planIds = await resolveIds(db, 'plans', input.planKeys);

  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [
    {
      sql: `INSERT INTO modules (id, key, name, description, price_monthly_cents, price_yearly_cents, currency,
                                 is_core, is_active, sort_order, features_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        input.key,
        input.name,
        input.description ?? null,
        input.priceMonthlyCents,
        input.priceYearlyCents,
        input.isCore ? 1 : 0,
        input.isActive ? 1 : 0,
        input.sortOrder,
        JSON.stringify(input.features),
        now,
        now,
      ],
    },
  ];

  for (const dependencyId of dependencyIds.values()) {
    statements.push({
      sql: `INSERT INTO module_dependencies (module_id, depends_on_module_id) VALUES (?, ?)`,
      params: [id, dependencyId],
    });
  }
  for (const planId of planIds.values()) {
    statements.push({
      sql: `INSERT INTO plan_modules (plan_id, module_id, included) VALUES (?, ?, 1)`,
      params: [planId, id],
    });
  }

  await db.batch(statements);
  return id;
}

export async function updateModule(db: Db, id: string, input: ModuleInput, now: number): Promise<void> {
  const dependencyIds = await resolveIds(db, 'modules', input.dependencyKeys.filter((key) => key !== input.key));
  const planIds = await resolveIds(db, 'plans', input.planKeys);

  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [
    {
      sql: `UPDATE modules
               SET key = ?, name = ?, description = ?, price_monthly_cents = ?, price_yearly_cents = ?,
                   is_core = ?, is_active = ?, sort_order = ?, features_json = ?, updated_at = ?
             WHERE id = ?`,
      params: [
        input.key,
        input.name,
        input.description ?? null,
        input.priceMonthlyCents,
        input.priceYearlyCents,
        input.isCore ? 1 : 0,
        input.isActive ? 1 : 0,
        input.sortOrder,
        JSON.stringify(input.features),
        now,
        id,
      ],
    },
    { sql: `DELETE FROM module_dependencies WHERE module_id = ?`, params: [id] },
    { sql: `DELETE FROM plan_modules WHERE module_id = ?`, params: [id] },
  ];

  for (const dependencyId of dependencyIds.values()) {
    statements.push({
      sql: `INSERT INTO module_dependencies (module_id, depends_on_module_id) VALUES (?, ?)`,
      params: [id, dependencyId],
    });
  }
  for (const planId of planIds.values()) {
    statements.push({
      sql: `INSERT INTO plan_modules (plan_id, module_id, included) VALUES (?, ?, 1)`,
      params: [planId, id],
    });
  }

  await db.batch(statements);
}

export async function createAddon(db: Db, input: AddonInput, now: number): Promise<string> {
  const id = newId('add');
  const planIds = await resolveIds(db, 'plans', input.plans.map((item) => item.planKey));

  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [
    {
      sql: `INSERT INTO addons (id, key, name, description, metric, unit_amount, unit_label,
                                price_monthly_cents, price_yearly_cents, currency, is_active, sort_order,
                                created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?)`,
      params: [
        id,
        input.key,
        input.name,
        input.description ?? null,
        input.metric,
        input.unitAmount,
        input.unitLabel,
        input.priceMonthlyCents,
        input.priceYearlyCents,
        input.isActive ? 1 : 0,
        input.sortOrder,
        now,
        now,
      ],
    },
  ];

  for (const plan of input.plans) {
    const planId = planIds.get(plan.planKey);
    if (!planId) continue;
    statements.push({
      sql: `INSERT INTO plan_addons (plan_id, addon_id, max_quantity) VALUES (?, ?, ?)`,
      params: [planId, id, plan.maxQuantity],
    });
  }

  await db.batch(statements);
  return id;
}

export async function updateAddon(db: Db, id: string, input: AddonInput, now: number): Promise<void> {
  const planIds = await resolveIds(db, 'plans', input.plans.map((item) => item.planKey));

  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [
    {
      sql: `UPDATE addons
               SET key = ?, name = ?, description = ?, metric = ?, unit_amount = ?, unit_label = ?,
                   price_monthly_cents = ?, price_yearly_cents = ?, is_active = ?, sort_order = ?, updated_at = ?
             WHERE id = ?`,
      params: [
        input.key,
        input.name,
        input.description ?? null,
        input.metric,
        input.unitAmount,
        input.unitLabel,
        input.priceMonthlyCents,
        input.priceYearlyCents,
        input.isActive ? 1 : 0,
        input.sortOrder,
        now,
        id,
      ],
    },
    { sql: `DELETE FROM plan_addons WHERE addon_id = ?`, params: [id] },
  ];

  for (const plan of input.plans) {
    const planId = planIds.get(plan.planKey);
    if (!planId) continue;
    statements.push({
      sql: `INSERT INTO plan_addons (plan_id, addon_id, max_quantity) VALUES (?, ?, ?)`,
      params: [planId, id, plan.maxQuantity],
    });
  }

  await db.batch(statements);
}
