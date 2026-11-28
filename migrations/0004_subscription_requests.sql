-- Plan gratuito de una sola vez y solicitudes de cambio de plan.
-- Los planes de pago no se activan solos: el administrador confirma el pago.

ALTER TABLE organizations ADD COLUMN free_plan_used_at INTEGER;

-- Las organizaciones existentes ya consumieron su plan de inicio.
UPDATE organizations SET free_plan_used_at = created_at WHERE free_plan_used_at IS NULL;

UPDATE plans
   SET name = 'Gratis',
       description = 'Plan gratuito de inicio, por única vez. Incluye lo esencial para ordenar tu cartera.',
       price_monthly_cents = 0,
       price_yearly_cents = 0,
       is_public = 0,
       trial_days = 15,
       sort_order = 0,
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE key = 'trial';

CREATE TABLE subscription_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
  note TEXT,
  admin_note TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT REFERENCES users(id)
);

CREATE INDEX ix_subscription_requests_status ON subscription_requests (status, created_at);
CREATE INDEX ix_subscription_requests_org ON subscription_requests (org_id, created_at DESC);
CREATE UNIQUE INDEX ux_subscription_requests_pending ON subscription_requests (org_id) WHERE status = 'pending';
