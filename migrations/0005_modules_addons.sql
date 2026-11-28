-- Etapa 2: catálogo de módulos funcionales y complementos de capacidad.
-- No modifica planes, suscripciones ni facturas existentes.

CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  price_yearly_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_core INTEGER NOT NULL DEFAULT 0 CHECK (is_core IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  features_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE module_dependencies (
  module_id TEXT NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  depends_on_module_id TEXT NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  PRIMARY KEY (module_id, depends_on_module_id),
  CHECK (module_id <> depends_on_module_id)
);

CREATE TABLE plan_modules (
  plan_id TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  included INTEGER NOT NULL DEFAULT 1 CHECK (included IN (0, 1)),
  PRIMARY KEY (plan_id, module_id)
);

CREATE TABLE addons (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  metric TEXT NOT NULL,
  unit_amount INTEGER NOT NULL CHECK (unit_amount > 0),
  unit_label TEXT NOT NULL,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  price_yearly_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE plan_addons (
  plan_id TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  addon_id TEXT NOT NULL REFERENCES addons (id) ON DELETE CASCADE,
  max_quantity INTEGER NOT NULL DEFAULT 1 CHECK (max_quantity >= 0),
  PRIMARY KEY (plan_id, addon_id)
);

CREATE INDEX ix_modules_active ON modules (is_active, sort_order);
CREATE INDEX ix_addons_active ON addons (is_active, sort_order);

INSERT INTO modules (id, key, name, description, price_monthly_cents, price_yearly_cents, currency, is_core, is_active, sort_order, features_json, created_at, updated_at) VALUES
  ('mod_core', 'core', 'Operación financiera', 'Préstamos, simulador, cuotas y pagos. Obligatorio en todos los planes.', 0, 0, 'USD', 1, 1, 10, '["Préstamos","Simulador","Cuotas","Pagos","Panel"]', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('mod_clients', 'clients', 'Gestión de clientes', 'Expedientes, documentos, referencias y estado del cliente.', 0, 0, 'USD', 1, 1, 20, '["Expedientes","Documentos","Referencias"]', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('mod_reports', 'reports', 'Inteligencia y reportes', 'Cartera, morosidad, aging, flujo de caja y exportaciones.', 500, 5000, 'USD', 0, 1, 30, '["Cartera","Morosidad","Aging","Flujo de caja","Exportaciones"]', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('mod_collections', 'collections', 'Cobranza', 'Agenda de cobros, asignaciones, gestiones y promesas de pago.', 500, 5000, 'USD', 0, 1, 40, '["Agenda","Asignaciones","Gestiones","Promesas"]', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('mod_cash', 'cash', 'Caja y tesorería', 'Aperturas, movimientos, arqueos y cierres de caja.', 500, 5000, 'USD', 0, 1, 50, '["Apertura","Movimientos","Arqueo","Cierre"]', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('mod_team', 'team', 'Equipo y roles', 'Usuarios, roles e invitaciones del negocio.', 300, 3000, 'USD', 0, 1, 60, '["Usuarios","Roles","Invitaciones"]', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

INSERT INTO module_dependencies (module_id, depends_on_module_id) VALUES
  ('mod_core', 'mod_clients'),
  ('mod_reports', 'mod_core'),
  ('mod_collections', 'mod_core'),
  ('mod_cash', 'mod_core'),
  ('mod_team', 'mod_core');

INSERT INTO plan_modules (plan_id, module_id, included) VALUES
  ('plan_trial', 'mod_core', 1),
  ('plan_trial', 'mod_clients', 1),
  ('plan_starter', 'mod_core', 1),
  ('plan_starter', 'mod_clients', 1),
  ('plan_starter', 'mod_reports', 1),
  ('plan_professional', 'mod_core', 1),
  ('plan_professional', 'mod_clients', 1),
  ('plan_professional', 'mod_reports', 1),
  ('plan_professional', 'mod_collections', 1),
  ('plan_professional', 'mod_cash', 1),
  ('plan_professional', 'mod_team', 1),
  ('plan_business', 'mod_core', 1),
  ('plan_business', 'mod_clients', 1),
  ('plan_business', 'mod_reports', 1),
  ('plan_business', 'mod_collections', 1),
  ('plan_business', 'mod_cash', 1),
  ('plan_business', 'mod_team', 1);

INSERT INTO addons (id, key, name, description, metric, unit_amount, unit_label, price_monthly_cents, price_yearly_cents, currency, is_active, sort_order, created_at, updated_at) VALUES
  ('add_clients_500', 'clients_500', '+500 clientes', 'Amplía el límite de clientes del plan.', 'clients', 500, 'clientes', 300, 3000, 'USD', 1, 10, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('add_loans_500', 'loans_500', '+500 préstamos activos', 'Amplía el límite de préstamos activos.', 'active_loans', 500, 'préstamos', 500, 5000, 'USD', 1, 20, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('add_user_1', 'user_1', '+1 usuario', 'Agrega un usuario adicional al equipo.', 'users', 1, 'usuario', 200, 2000, 'USD', 1, 30, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('add_storage_5gb', 'storage_5gb', '+5 GB de almacenamiento', 'Amplía el almacenamiento de documentos.', 'storage_mb', 5120, 'MB', 300, 3000, 'USD', 1, 40, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('add_branch_1', 'branch_1', '+1 sucursal', 'Requiere el módulo de sucursales, que todavía no está implementado.', 'branches', 1, 'sucursal', 500, 5000, 'USD', 0, 50, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('add_history_180', 'history_180', '+180 días de historial', 'Requiere el control efectivo de historial, todavía pendiente.', 'history_days', 180, 'días', 300, 3000, 'USD', 0, 60, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

INSERT INTO plan_addons (plan_id, addon_id, max_quantity) VALUES
  ('plan_starter', 'add_clients_500', 3),
  ('plan_starter', 'add_loans_500', 2),
  ('plan_starter', 'add_user_1', 1),
  ('plan_starter', 'add_storage_5gb', 2),
  ('plan_professional', 'add_clients_500', 5),
  ('plan_professional', 'add_loans_500', 4),
  ('plan_professional', 'add_user_1', 5),
  ('plan_professional', 'add_storage_5gb', 6),
  ('plan_business', 'add_clients_500', 10),
  ('plan_business', 'add_loans_500', 8),
  ('plan_business', 'add_user_1', 10),
  ('plan_business', 'add_storage_5gb', 10);
