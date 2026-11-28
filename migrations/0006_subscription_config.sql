-- Etapa 4: configuración de suscripción por organización.
-- No modifica precios, facturas ni períodos existentes.

ALTER TABLE subscriptions ADD COLUMN grace_ends_at INTEGER;

CREATE TABLE subscription_modules (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules (id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),
  activated_at INTEGER NOT NULL,
  ends_at INTEGER,
  price_snapshot_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (subscription_id, module_id)
);

CREATE TABLE subscription_addons (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
  addon_id TEXT NOT NULL REFERENCES addons (id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_snapshot_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),
  activated_at INTEGER NOT NULL,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (subscription_id, addon_id)
);

CREATE TABLE subscription_change_history (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  actor_user_id TEXT REFERENCES users (id),
  created_at INTEGER NOT NULL
);

CREATE INDEX ix_subscription_change_history_sub ON subscription_change_history (subscription_id, created_at DESC);
CREATE INDEX ix_subscription_modules_active ON subscription_modules (subscription_id, status);
CREATE INDEX ix_subscription_addons_active ON subscription_addons (subscription_id, status);

-- Backfill: cada suscripción recibe los módulos incluidos en su plan.
INSERT INTO subscription_modules (id, subscription_id, module_id, status, activated_at, ends_at, price_snapshot_cents, created_at)
SELECT 'smod_' || s.id || '_' || pm.module_id, s.id, pm.module_id, 'active', s.current_period_start, NULL, 0,
       CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM subscriptions s
  JOIN plan_modules pm ON pm.plan_id = s.plan_id AND pm.included = 1;

-- Fecha de fin de tolerancia a partir del período y los días de gracia del plan.
UPDATE subscriptions
   SET grace_ends_at = current_period_end + COALESCE((SELECT grace_days FROM plans p WHERE p.id = subscriptions.plan_id), 0) * 86400000
 WHERE grace_ends_at IS NULL;
