-- Etapa 2 (pagos): métodos de pago tokenizados y motor de cobro recurrente.
-- Nunca se guardan números de tarjeta ni CVV: solo el token del proveedor.
-- Ver docs/PAGOS-LAFISE.md §6.

CREATE TABLE payment_methods (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider           TEXT NOT NULL,
  provider_token_ref TEXT NOT NULL,
  authorization_ref  TEXT,
  brand              TEXT,
  last4              TEXT,
  exp_month          INTEGER,
  exp_year           INTEGER,
  holder_name        TEXT,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'failed')),
  is_default         INTEGER NOT NULL DEFAULT 1 CHECK (is_default IN (0, 1)),
  authorized_at      INTEGER,
  revoked_at         INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_payment_methods_token ON payment_methods (provider, provider_token_ref);
CREATE INDEX ix_payment_methods_org ON payment_methods (org_id, status);

ALTER TABLE subscriptions ADD COLUMN payment_method_id TEXT REFERENCES payment_methods (id);

-- Intentos de cobro: reutiliza billing_payments en lugar de una tabla paralela.
ALTER TABLE billing_payments ADD COLUMN payment_method_id TEXT REFERENCES payment_methods (id);
ALTER TABLE billing_payments ADD COLUMN idempotency_key TEXT;
ALTER TABLE billing_payments ADD COLUMN attempt_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE billing_payments ADD COLUMN error_code TEXT;
ALTER TABLE billing_payments ADD COLUMN error_message TEXT;
ALTER TABLE billing_payments ADD COLUMN next_retry_at INTEGER;
ALTER TABLE billing_payments ADD COLUMN request_json TEXT;

CREATE UNIQUE INDEX ux_billing_payments_idempotency ON billing_payments (provider, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX ix_billing_payments_retry ON billing_payments (status, next_retry_at);
CREATE INDEX ix_billing_payments_invoice ON billing_payments (invoice_id);

CREATE INDEX ix_invoices_subscription_period ON invoices (subscription_id, period_start);
