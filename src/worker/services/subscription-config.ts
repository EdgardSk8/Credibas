import type { Db } from '../db';
import { AppError } from '../lib/errors';
import { newId } from '../lib/crypto';
import { quoteSubscription, type SubscriptionConfig, type SubscriptionQuote } from '../../shared/billing/pricing';
import { listAddons, listModules } from '../repositories/catalog';
import { getPlanByKey, getSubscription } from '../repositories/subscriptions';
import { getLimitState, LIMIT_LABELS } from './limits';
import { loadPlanCatalog } from './pricing';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExceededLimit {
  metric: string;
  label: string;
  limit: number;
  current: number;
}

export interface SubscriptionConfigView {
  planKey: string;
  billingCycle: 'monthly' | 'yearly';
  moduleKeys: string[];
  addons: Array<{ key: string; quantity: number }>;
  modules: Array<{ key: string; priceSnapshotCents: number }>;
  addonRows: Array<{ key: string; quantity: number; priceSnapshotCents: number }>;
  quote: SubscriptionQuote | null;
  periodEnd: number;
  graceEndsAt: number | null;
}

export async function getSubscriptionConfig(db: Db, orgId: string): Promise<SubscriptionConfigView> {
  const subscription = await getSubscription(db, orgId);
  if (!subscription) throw AppError.notFound('La organización no tiene suscripción');

  const modules = await db.all<{ key: string; price_snapshot_cents: number }>(
    `SELECT m.key, sm.price_snapshot_cents
       FROM subscription_modules sm JOIN modules m ON m.id = sm.module_id
      WHERE sm.subscription_id = ? AND sm.status = 'active'
      ORDER BY m.sort_order ASC`,
    [subscription.id],
  );
  const addonRows = await db.all<{ key: string; quantity: number; price_snapshot_cents: number }>(
    `SELECT a.key, sa.quantity, sa.price_snapshot_cents
       FROM subscription_addons sa JOIN addons a ON a.id = sa.addon_id
      WHERE sa.subscription_id = ? AND sa.status = 'active'
      ORDER BY a.sort_order ASC`,
    [subscription.id],
  );

  const config: SubscriptionConfig = {
    planKey: subscription.plan.key,
    billingCycle: subscription.billing_cycle,
    moduleKeys: modules.map((module) => module.key),
    addons: addonRows.map((addon) => ({ key: addon.key, quantity: Number(addon.quantity) })),
  };

  let quote: SubscriptionQuote | null = null;
  try {
    quote = quoteSubscription(await loadPlanCatalog(db, config.planKey), config);
  } catch {
    quote = null;
  }

  return {
    planKey: config.planKey,
    billingCycle: config.billingCycle,
    moduleKeys: config.moduleKeys,
    addons: config.addons,
    modules: modules.map((module) => ({ key: module.key, priceSnapshotCents: Number(module.price_snapshot_cents) })),
    addonRows: addonRows.map((addon) => ({
      key: addon.key,
      quantity: Number(addon.quantity),
      priceSnapshotCents: Number(addon.price_snapshot_cents),
    })),
    quote,
    periodEnd: subscription.current_period_end,
    graceEndsAt: subscription.grace_ends_at,
  };
}

export async function previewSubscriptionConfig(
  db: Db,
  orgId: string,
  config: SubscriptionConfig,
): Promise<{ quote: SubscriptionQuote; exceeded: ExceededLimit[] }> {
  const quote = quoteSubscription(await loadPlanCatalog(db, config.planKey), config);
  const limitState = await getLimitState(db, orgId);

  const exceeded = Object.entries(quote.effectiveLimits)
    .filter(([metric, limit]) => limit >= 0 && (limitState.usage[metric] ?? 0) > limit)
    .map(([metric, limit]) => ({
      metric,
      label: LIMIT_LABELS[metric] ?? metric,
      limit,
      current: limitState.usage[metric] ?? 0,
    }));

  return { quote, exceeded };
}

export async function applySubscriptionConfig(
  db: Db,
  input: { orgId: string; config: SubscriptionConfig; actorUserId: string },
  now: number,
): Promise<{ quote: SubscriptionQuote; exceeded: ExceededLimit[] }> {
  const subscription = await getSubscription(db, input.orgId);
  if (!subscription) throw AppError.notFound('La organización no tiene suscripción');

  const plan = await getPlanByKey(db, input.config.planKey);
  if (!plan) throw AppError.badRequest('El plan no existe');

  const { quote, exceeded } = await previewSubscriptionConfig(db, input.orgId, input.config);
  if (exceeded.length > 0) {
    throw AppError.conflict('El uso actual supera los límites del nuevo plan.', { exceeded });
  }

  const modulesByKey = new Map((await listModules(db)).map((module) => [module.key, module]));
  const addonsByKey = new Map((await listAddons(db)).map((addon) => [addon.key, addon]));

  const before = await getSubscriptionConfig(db, input.orgId);
  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [];

  statements.push({
    sql: `UPDATE subscriptions
             SET plan_id = ?, billing_cycle = ?, grace_ends_at = ?, updated_at = ?
           WHERE id = ?`,
    params: [
      plan.id,
      input.config.billingCycle,
      subscription.current_period_end + Math.max(0, plan.grace_days) * DAY_MS,
      now,
      subscription.id,
    ],
  });

  const moduleRows = input.config.moduleKeys
    .map((key) => modulesByKey.get(key))
    .filter((module): module is NonNullable<typeof module> => Boolean(module))
    .map((module) => ({
      id: module.id,
      key: module.key,
      price: quote.lines.find((line) => line.kind === 'module' && line.key === module.key)?.unitCents ?? 0,
    }));

  const moduleIds = moduleRows.map((module) => module.id);
  statements.push({
    sql: moduleIds.length
      ? `UPDATE subscription_modules SET status = 'canceled', ends_at = ?
           WHERE subscription_id = ? AND status = 'active' AND module_id NOT IN (${moduleIds.map(() => '?').join(', ')})`
      : `UPDATE subscription_modules SET status = 'canceled', ends_at = ? WHERE subscription_id = ? AND status = 'active'`,
    params: moduleIds.length ? [now, subscription.id, ...moduleIds] : [now, subscription.id],
  });

  for (const module of moduleRows) {
    statements.push({
      sql: `INSERT INTO subscription_modules
              (id, subscription_id, module_id, status, activated_at, ends_at, price_snapshot_cents, created_at)
            VALUES (?, ?, ?, 'active', ?, NULL, ?, ?)
            ON CONFLICT (subscription_id, module_id) DO UPDATE SET
              status = 'active', ends_at = NULL, price_snapshot_cents = excluded.price_snapshot_cents`,
      params: [newId('smod'), subscription.id, module.id, now, module.price, now],
    });
  }

  const addonRows = input.config.addons
    .map((item) => addonsByKey.get(item.key))
    .filter((addon): addon is NonNullable<typeof addon> => Boolean(addon))
    .map((addon) => ({
      id: addon.id,
      key: addon.key,
      quantity: input.config.addons.find((item) => item.key === addon.key)?.quantity ?? 1,
      price: quote.lines.find((line) => line.kind === 'addon' && line.key === addon.key)?.unitCents ?? 0,
    }));

  const addonIds = addonRows.map((addon) => addon.id);
  statements.push({
    sql: addonIds.length
      ? `UPDATE subscription_addons SET status = 'canceled', ends_at = ?
           WHERE subscription_id = ? AND status = 'active' AND addon_id NOT IN (${addonIds.map(() => '?').join(', ')})`
      : `UPDATE subscription_addons SET status = 'canceled', ends_at = ? WHERE subscription_id = ? AND status = 'active'`,
    params: addonIds.length ? [now, subscription.id, ...addonIds] : [now, subscription.id],
  });

  for (const addon of addonRows) {
    statements.push({
      sql: `INSERT INTO subscription_addons
              (id, subscription_id, addon_id, quantity, price_snapshot_cents, status, activated_at, ends_at, created_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?, NULL, ?)
            ON CONFLICT (subscription_id, addon_id) DO UPDATE SET
              quantity = excluded.quantity, price_snapshot_cents = excluded.price_snapshot_cents,
              status = 'active', ends_at = NULL`,
      params: [newId('sadd'), subscription.id, addon.id, addon.quantity, addon.price, now, now],
    });
  }

  const after = {
    planKey: plan.key,
    billingCycle: input.config.billingCycle,
    moduleKeys: moduleRows.map((module) => module.key),
    addons: addonRows.map((addon) => ({ key: addon.key, quantity: addon.quantity })),
    totalCents: quote.totalCents,
  };

  statements.push({
    sql: `INSERT INTO subscription_change_history (id, subscription_id, kind, before_json, after_json, actor_user_id, created_at)
          VALUES (?, ?, 'config_update', ?, ?, ?, ?)`,
    params: [
      newId('schg'),
      subscription.id,
      JSON.stringify({ planKey: before.planKey, billingCycle: before.billingCycle, moduleKeys: before.moduleKeys, addons: before.addons }),
      JSON.stringify(after),
      input.actorUserId,
      now,
    ],
  });

  await db.batch(statements);

  return { quote, exceeded: [] };
}
