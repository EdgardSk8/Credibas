-- =============================================================================
-- CREDIBAS — Datos de referencia del sistema
-- Permisos, planes y límites. Los precios son hipótesis comerciales editables
-- desde el panel administrativo global (USD, unidades menores).
-- =============================================================================

INSERT INTO permissions (key, module, description) VALUES
  ('org.read', 'organization', 'Ver los datos de la organizacion'),
  ('org.update', 'organization', 'Editar los datos del negocio'),
  ('org.settings', 'organization', 'Cambiar la configuracion del negocio'),
  ('members.read', 'members', 'Ver miembros y roles'),
  ('members.invite', 'members', 'Invitar colaboradores'),
  ('members.update', 'members', 'Cambiar roles de colaboradores'),
  ('members.remove', 'members', 'Remover colaboradores'),
  ('clients.read', 'clients', 'Ver clientes'),
  ('clients.write', 'clients', 'Crear y editar clientes'),
  ('clients.delete', 'clients', 'Desactivar o eliminar clientes'),
  ('clients.documents', 'clients', 'Gestionar documentos de clientes'),
  ('loans.read', 'loans', 'Ver prestamos y calendarios'),
  ('loans.write', 'loans', 'Crear prestamos'),
  ('loans.adjust', 'loans', 'Reestructurar o ajustar prestamos'),
  ('loans.cancel', 'loans', 'Cancelar prestamos'),
  ('payments.read', 'payments', 'Ver pagos'),
  ('payments.write', 'payments', 'Registrar pagos'),
  ('payments.reverse', 'payments', 'Revertir pagos confirmados'),
  ('collections.read', 'collections', 'Ver agenda y gestiones de cobro'),
  ('collections.write', 'collections', 'Registrar gestiones de cobro'),
  ('cash.read', 'cash', 'Ver caja y movimientos'),
  ('cash.write', 'cash', 'Registrar movimientos de caja'),
  ('cash.close', 'cash', 'Abrir y cerrar caja'),
  ('reports.read', 'reports', 'Ver reportes'),
  ('reports.export', 'reports', 'Exportar reportes'),
  ('billing.read', 'billing', 'Ver suscripcion y facturas'),
  ('billing.manage', 'billing', 'Cambiar plan y gestionar facturacion'),
  ('audit.read', 'audit', 'Ver el registro de auditoria');

INSERT INTO plans (
  id, key, name, description,
  price_monthly_cents, price_yearly_cents, currency,
  trial_days, grace_days, is_active, is_public, sort_order, features_json,
  created_at, updated_at
) VALUES
  (
    'plan_trial', 'trial', 'Prueba',
    'Evaluacion completa por 15 dias con limites reducidos.',
    0, 0, 'USD', 14, 7, 1, 0, 0,
    '["Acceso a modulos principales","1 usuario","Hasta 25 prestamos activos","Soporte por correo"]',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ),
  (
    'plan_starter', 'starter', 'Starter',
    'Para prestamistas individuales que ordenan su cartera.',
    990, 9900, 'USD', 14, 7, 1, 1, 10,
    '["Clientes y prestamos","Control de cuotas y pagos","Reportes basicos","1 usuario","Soporte por correo"]',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ),
  (
    'plan_professional', 'professional', 'Professional',
    'Para negocios con cobradores y varias rutas de cobro.',
    2490, 24900, 'USD', 14, 7, 1, 1, 20,
    '["Todo lo de Starter","Hasta 5 usuarios","Gestion de cobradores","Caja y arqueos","Reportes avanzados","Exportaciones"]',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') as INTEGER) * 1000
  ),
  (
    'plan_business', 'business', 'Business',
    'Para financieras con cartera alta y equipos completos.',
    4990, 49900, 'USD', 14, 7, 1, 1, 30,
    '["Todo lo de Professional","Hasta 15 usuarios","Roles personalizados","Sucursales","Mayor almacenamiento","Soporte prioritario"]',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  );

INSERT INTO plan_limits (plan_id, limit_key, limit_value) VALUES
  ('plan_trial', 'users', 1),
  ('plan_trial', 'clients', 50),
  ('plan_trial', 'active_loans', 25),
  ('plan_trial', 'storage_mb', 100),
  ('plan_trial', 'branches', 1),
  ('plan_trial', 'collectors', 0),
  ('plan_trial', 'exports_per_month', 5),
  ('plan_trial', 'history_days', 90),

  ('plan_starter', 'users', 1),
  ('plan_starter', 'clients', 300),
  ('plan_starter', 'active_loans', 150),
  ('plan_starter', 'storage_mb', 500),
  ('plan_starter', 'branches', 1),
  ('plan_starter', 'collectors', 0),
  ('plan_starter', 'exports_per_month', 20),
  ('plan_starter', 'history_days', 365),

  ('plan_professional', 'users', 5),
  ('plan_professional', 'clients', 2000),
  ('plan_professional', 'active_loans', 1000),
  ('plan_professional', 'storage_mb', 2048),
  ('plan_professional', 'branches', 2),
  ('plan_professional', 'collectors', 5),
  ('plan_professional', 'exports_per_month', 100),
  ('plan_professional', 'history_days', 1095),

  ('plan_business', 'users', 15),
  ('plan_business', 'clients', 10000),
  ('plan_business', 'active_loans', 5000),
  ('plan_business', 'storage_mb', 10240),
  ('plan_business', 'branches', 5),
  ('plan_business', 'collectors', 25),
  ('plan_business', 'exports_per_month', 500),
  ('plan_business', 'history_days', 3650);

INSERT INTO settings (id, org_id, key, value_json, updated_at) VALUES
  ('setting_platform_defaults', NULL, 'platform.defaults',
   '{"currency":"NIO","supportedCurrencies":["NIO","USD"],"defaultLateFeeDailyBps":50,"defaultGraceDays":0,"paymentAllocationOrder":["late_fee","interest","principal","fee"],"trialDays":14}',
   CAST(strftime('%s', 'now') AS INTEGER) * 1000);

INSERT INTO exchange_rates (id, base_currency, quote_currency, rate_micros, effective_date, source, created_at)
VALUES ('rate_usd_nio_seed', 'USD', 'NIO', 36700000, '2026-01-01', 'seed',
        CAST(strftime('%s', 'now') AS INTEGER) * 1000);
