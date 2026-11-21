-- =============================================================================
-- CREDIBAS — Esquema core (Fase 1)
-- Todas las tablas de negocio llevan org_id (tenant). Importes en unidades
-- menores (centavos), tasas en puntos base (bps), fechas de negocio como
-- 'YYYY-MM-DD' y marcas de tiempo como epoch en milisegundos.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- Identidad y sesiones
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL COLLATE NOCASE,
  full_name           TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  password_salt       TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  email_verified_at   INTEGER,
  is_platform_admin   INTEGER NOT NULL DEFAULT 0 CHECK (is_platform_admin IN (0, 1)),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  last_login_at       INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_users_email ON users (email);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  org_id       TEXT,
  token_hash   TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);
CREATE UNIQUE INDEX ux_sessions_token ON sessions (token_hash);
CREATE INDEX ix_sessions_user ON sessions (user_id, revoked_at, expires_at);

CREATE TABLE email_verifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE UNIQUE INDEX ux_email_verifications_token ON email_verifications (token_hash);
CREATE INDEX ix_email_verifications_user ON email_verifications (user_id, consumed_at);

CREATE TABLE password_resets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE UNIQUE INDEX ux_password_resets_token ON password_resets (token_hash);
CREATE INDEX ix_password_resets_user ON password_resets (user_id, consumed_at);

CREATE TABLE login_attempts (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  ip         TEXT,
  success    INTEGER NOT NULL CHECK (success IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX ix_login_attempts_identifier ON login_attempts (identifier, created_at);
CREATE INDEX ix_login_attempts_ip ON login_attempts (ip, created_at);

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- -----------------------------------------------------------------------------
-- Organizaciones, membresías y RBAC
-- -----------------------------------------------------------------------------
CREATE TABLE organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  currency      TEXT NOT NULL DEFAULT 'NIO' CHECK (currency IN ('NIO', 'USD')),
  timezone      TEXT NOT NULL DEFAULT 'America/Managua',
  date_format   TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
  locale        TEXT NOT NULL DEFAULT 'es-NI',
  logo_r2_key   TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_organizations_slug ON organizations (slug);
CREATE INDEX ix_organizations_owner ON organizations (owner_user_id);

CREATE TABLE permissions (
  key         TEXT PRIMARY KEY,
  module      TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE roles (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_roles_org_key ON roles (org_id, key);

CREATE TABLE role_permissions (
  role_id        TEXT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions (key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE organization_members (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id     TEXT NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  invited_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  invited_at  INTEGER,
  accepted_at INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_members_org_user ON organization_members (org_id, user_id);
CREATE INDEX ix_members_user ON organization_members (user_id, status);

CREATE TABLE invitations (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  email       TEXT NOT NULL COLLATE NOCASE,
  role_id     TEXT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  invited_by  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  accepted_at INTEGER
);
CREATE UNIQUE INDEX ux_invitations_token ON invitations (token_hash);
CREATE INDEX ix_invitations_org_email ON invitations (org_id, email, accepted_at);

-- -----------------------------------------------------------------------------
-- Planes, suscripciones y facturación SaaS
-- -----------------------------------------------------------------------------
CREATE TABLE plans (
  id                  TEXT PRIMARY KEY,
  key                 TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  price_yearly_cents  INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  trial_days          INTEGER NOT NULL DEFAULT 0,
  grace_days          INTEGER NOT NULL DEFAULT 7,
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_public           INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  features_json       TEXT NOT NULL DEFAULT '[]',
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_plans_key ON plans (key);

CREATE TABLE plan_limits (
  plan_id     TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  limit_key   TEXT NOT NULL,
  limit_value INTEGER NOT NULL,
  PRIMARY KEY (plan_id, limit_key)
);

CREATE TABLE subscriptions (
  id                   TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  plan_id              TEXT NOT NULL REFERENCES plans (id) ON DELETE RESTRICT,
  status               TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  billing_cycle        TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  trial_ends_at        INTEGER,
  current_period_start INTEGER NOT NULL,
  current_period_end   INTEGER NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  canceled_at          INTEGER,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_subscriptions_org ON subscriptions (org_id);
CREATE INDEX ix_subscriptions_status ON subscriptions (status, current_period_end);

CREATE TABLE subscription_usage (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  period     TEXT NOT NULL,
  metric     TEXT NOT NULL,
  value      INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_subscription_usage ON subscription_usage (org_id, period, metric);

CREATE TABLE subscription_events (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions (id) ON DELETE SET NULL,
  type            TEXT NOT NULL,
  data_json       TEXT NOT NULL DEFAULT '{}',
  actor_user_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX ix_subscription_events_org ON subscription_events (org_id, created_at);

CREATE TABLE invoices (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions (id) ON DELETE SET NULL,
  number          TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'overdue', 'void')),
  period_start    INTEGER NOT NULL,
  period_end      INTEGER NOT NULL,
  issued_at       INTEGER NOT NULL,
  due_at          INTEGER NOT NULL,
  paid_at         INTEGER,
  notes           TEXT,
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_invoices_number ON invoices (number);
CREATE INDEX ix_invoices_org ON invoices (org_id, status);

CREATE TABLE billing_payments (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  invoice_id   TEXT REFERENCES invoices (id) ON DELETE SET NULL,
  provider     TEXT NOT NULL,
  provider_ref TEXT,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  status       TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
  proof_r2_key TEXT,
  raw_json     TEXT,
  confirmed_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  confirmed_at INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_billing_payments_provider_ref ON billing_payments (provider, provider_ref);
CREATE INDEX ix_billing_payments_org ON billing_payments (org_id, status);

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
CREATE TABLE clients (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  identification  TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  references_json TEXT NOT NULL DEFAULT '[]',
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  created_by      TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE UNIQUE INDEX ux_clients_org_code ON clients (org_id, code);
CREATE UNIQUE INDEX ux_clients_org_identification ON clients (org_id, identification)
  WHERE identification IS NOT NULL AND identification <> '';
CREATE INDEX ix_clients_org_status ON clients (org_id, status, deleted_at);
CREATE INDEX ix_clients_org_name ON clients (org_id, full_name);

CREATE TABLE client_documents (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  r2_key       TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  uploaded_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX ix_client_documents_client ON client_documents (org_id, client_id);
CREATE UNIQUE INDEX ux_client_documents_key ON client_documents (r2_key);

-- -----------------------------------------------------------------------------
-- Préstamos y calendario de pagos
-- -----------------------------------------------------------------------------
CREATE TABLE loans (
  id                   TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  client_id            TEXT NOT NULL REFERENCES clients (id) ON DELETE RESTRICT,
  code                 TEXT NOT NULL,
  currency             TEXT NOT NULL CHECK (currency IN ('NIO', 'USD')),
  exchange_rate_micros INTEGER,
  principal_cents      INTEGER NOT NULL CHECK (principal_cents > 0),
  interest_rate_bps    INTEGER NOT NULL CHECK (interest_rate_bps >= 0),
  interest_type        TEXT NOT NULL CHECK (interest_type IN ('flat', 'declining')),
  amortization_method  TEXT NOT NULL CHECK (amortization_method IN ('flat_interest', 'fixed_installment', 'declining_principal')),
  installment_count    INTEGER NOT NULL CHECK (installment_count > 0),
  frequency            TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom')),
  custom_days          INTEGER,
  disbursement_date    TEXT NOT NULL,
  first_due_date       TEXT NOT NULL,
  total_interest_cents INTEGER NOT NULL DEFAULT 0,
  total_fee_cents      INTEGER NOT NULL DEFAULT 0,
  total_to_pay_cents   INTEGER NOT NULL DEFAULT 0,
  late_fee_daily_bps   INTEGER NOT NULL DEFAULT 0,
  grace_days           INTEGER NOT NULL DEFAULT 0,
  schedule_version     INTEGER NOT NULL DEFAULT 1,
  status               TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('draft', 'active', 'settled', 'defaulted', 'cancelled', 'restructured')),
  notes                TEXT,
  created_by           TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  settled_at           INTEGER,
  deleted_at           INTEGER
);
CREATE UNIQUE INDEX ux_loans_org_code ON loans (org_id, code);
CREATE INDEX ix_loans_org_status ON loans (org_id, status, deleted_at);
CREATE INDEX ix_loans_org_client ON loans (org_id, client_id);

CREATE TABLE loan_schedule_versions (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  loan_id    TEXT NOT NULL REFERENCES loans (id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  reason     TEXT,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_loan_schedule_versions ON loan_schedule_versions (loan_id, version);

CREATE TABLE installments (
  id                     TEXT PRIMARY KEY,
  org_id                 TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  loan_id                TEXT NOT NULL REFERENCES loans (id) ON DELETE CASCADE,
  version                INTEGER NOT NULL DEFAULT 1,
  number                 INTEGER NOT NULL,
  due_date               TEXT NOT NULL,
  principal_cents        INTEGER NOT NULL,
  interest_cents         INTEGER NOT NULL,
  fee_cents              INTEGER NOT NULL DEFAULT 0,
  total_cents            INTEGER NOT NULL,
  paid_principal_cents   INTEGER NOT NULL DEFAULT 0,
  paid_interest_cents    INTEGER NOT NULL DEFAULT 0,
  paid_fee_cents         INTEGER NOT NULL DEFAULT 0,
  paid_late_fee_cents    INTEGER NOT NULL DEFAULT 0,
  late_fee_accrued_cents INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'restructured', 'cancelled')),
  paid_at                INTEGER,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_installments_loan_version_number ON installments (loan_id, version, number);
CREATE INDEX ix_installments_org_due ON installments (org_id, due_date, status);
CREATE INDEX ix_installments_org_loan ON installments (org_id, loan_id, status);

CREATE TABLE loan_adjustments (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  loan_id      TEXT NOT NULL REFERENCES loans (id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('reschedule', 'capital_abono', 'rate_change', 'cancellation')),
  reason       TEXT NOT NULL,
  amount_cents INTEGER,
  data_json    TEXT NOT NULL DEFAULT '{}',
  created_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX ix_loan_adjustments_loan ON loan_adjustments (org_id, loan_id, created_at);

-- -----------------------------------------------------------------------------
-- Pagos
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  client_id       TEXT NOT NULL REFERENCES clients (id) ON DELETE RESTRICT,
  loan_id         TEXT NOT NULL REFERENCES loans (id) ON DELETE RESTRICT,
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  currency        TEXT NOT NULL CHECK (currency IN ('NIO', 'USD')),
  method          TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'card', 'other')),
  reference       TEXT,
  paid_at         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'reversed')),
  notes           TEXT,
  created_by      TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL,
  reversed_at     INTEGER,
  reversed_by     TEXT REFERENCES users (id) ON DELETE SET NULL,
  reversal_reason TEXT
);
CREATE INDEX ix_payments_org_paid_at ON payments (org_id, paid_at);
CREATE INDEX ix_payments_org_loan ON payments (org_id, loan_id, status);

CREATE TABLE payment_allocations (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  payment_id      TEXT NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  installment_id  TEXT NOT NULL REFERENCES installments (id) ON DELETE RESTRICT,
  principal_cents INTEGER NOT NULL DEFAULT 0,
  interest_cents  INTEGER NOT NULL DEFAULT 0,
  fee_cents       INTEGER NOT NULL DEFAULT 0,
  late_fee_cents  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX ix_payment_allocations_payment ON payment_allocations (payment_id);
CREATE INDEX ix_payment_allocations_installment ON payment_allocations (installment_id);

CREATE TABLE payment_reversals (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  payment_id  TEXT NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  reversed_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_payment_reversals_payment ON payment_reversals (payment_id);

-- -----------------------------------------------------------------------------
-- Caja
-- -----------------------------------------------------------------------------
CREATE TABLE cash_registers (
  id                     TEXT PRIMARY KEY,
  org_id                 TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  opened_by              TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  opened_at              INTEGER NOT NULL,
  closed_by              TEXT REFERENCES users (id) ON DELETE SET NULL,
  closed_at              INTEGER,
  opening_balance_cents  INTEGER NOT NULL DEFAULT 0,
  expected_balance_cents INTEGER,
  counted_balance_cents  INTEGER,
  difference_cents       INTEGER,
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes                  TEXT
);
CREATE INDEX ix_cash_registers_org ON cash_registers (org_id, status, opened_at);

CREATE TABLE cash_movements (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  register_id  TEXT NOT NULL REFERENCES cash_registers (id) ON DELETE CASCADE,
  direction    TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  category     TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency     TEXT NOT NULL CHECK (currency IN ('NIO', 'USD')),
  source_type  TEXT NOT NULL CHECK (source_type IN ('payment', 'loan_disbursement', 'manual', 'adjustment', 'expense')),
  source_id    TEXT,
  description  TEXT,
  created_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX ix_cash_movements_register ON cash_movements (org_id, register_id, created_at);
CREATE INDEX ix_cash_movements_source ON cash_movements (org_id, source_type, source_id);

-- -----------------------------------------------------------------------------
-- Cobros y gestiones
-- -----------------------------------------------------------------------------
CREATE TABLE collection_assignments (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  client_id           TEXT NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  loan_id             TEXT REFERENCES loans (id) ON DELETE CASCADE,
  collector_member_id TEXT NOT NULL REFERENCES organization_members (id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  next_contact_at     TEXT,
  notes               TEXT,
  created_by          TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX ix_collection_assignments_org ON collection_assignments (org_id, status, next_contact_at);
CREATE INDEX ix_collection_assignments_collector ON collection_assignments (org_id, collector_member_id, status);

CREATE TABLE collection_activities (
  id                   TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  assignment_id        TEXT REFERENCES collection_assignments (id) ON DELETE SET NULL,
  client_id            TEXT NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  loan_id              TEXT REFERENCES loans (id) ON DELETE SET NULL,
  type                 TEXT NOT NULL CHECK (type IN ('call', 'visit', 'message', 'promise', 'note')),
  outcome              TEXT,
  notes                TEXT,
  promise_amount_cents INTEGER,
  promise_date         TEXT,
  created_by           TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at           INTEGER NOT NULL
);
CREATE INDEX ix_collection_activities_org ON collection_activities (org_id, client_id, created_at);
CREATE INDEX ix_collection_activities_promise ON collection_activities (org_id, promise_date);

-- -----------------------------------------------------------------------------
-- Notificaciones, auditoría, configuración
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  org_id     TEXT REFERENCES organizations (id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  channel    TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  data_json  TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  sent_at    INTEGER,
  read_at    INTEGER
);
CREATE INDEX ix_notifications_user ON notifications (user_id, status, created_at);
CREATE INDEX ix_notifications_org ON notifications (org_id, created_at);

CREATE TABLE audit_logs (
  id            TEXT PRIMARY KEY,
  org_id        TEXT REFERENCES organizations (id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  before_json   TEXT,
  after_json    TEXT,
  ip            TEXT,
  user_agent    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX ix_audit_logs_org ON audit_logs (org_id, created_at);
CREATE INDEX ix_audit_logs_entity ON audit_logs (entity_type, entity_id);

CREATE TABLE exchange_rates (
  id             TEXT PRIMARY KEY,
  base_currency  TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate_micros    INTEGER NOT NULL CHECK (rate_micros > 0),
  effective_date TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'manual',
  created_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_exchange_rates_pair_date ON exchange_rates (base_currency, quote_currency, effective_date);

CREATE TABLE settings (
  id         TEXT PRIMARY KEY,
  org_id     TEXT REFERENCES organizations (id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_settings_scope_key ON settings (COALESCE(org_id, ''), key);

CREATE TABLE sequences (
  org_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  prefix     TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (org_id, name)
);
