-- =============================================================================
-- CREDIBAS — Datos de demostración (SOLO DESARROLLO)
-- Usuario: demo@credibas.app / Demo2026x
-- No ejecutar en producción.
-- =============================================================================

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users (
  id, email, full_name, password_hash, password_salt, password_iterations,
  email_verified_at, is_platform_admin, status, last_login_at, created_at, updated_at
) VALUES (
  'usr_11111111-1111-4111-8111-111111111111',
  'demo@credibas.app',
  'Demo Credibas',
  'Spiz7Ng83ZGEztoOaUUTHXVQCEOWv9X1du7FNSKbstk=',
  'M+que3aO7QFDhOKO3EczJQ==',
  600000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  1,
  'active',
  NULL,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

INSERT OR IGNORE INTO organizations (
  id, name, slug, owner_user_id, currency, timezone, date_format, locale,
  logo_r2_key, status, created_at, updated_at
) VALUES (
  'org_11111111-1111-4111-8111-111111111111',
  'Financiera Demo',
  'financiera-demo',
  'usr_11111111-1111-4111-8111-111111111111',
  'NIO',
  'America/Managua',
  'dd/MM/yyyy',
  'es-NI',
  NULL,
  'active',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

INSERT OR IGNORE INTO roles (id, org_id, key, name, description, is_system, created_at) VALUES
  ('rol_11111111-1111-4111-8111-111111111111', 'org_11111111-1111-4111-8111-111111111111', 'owner', 'Propietario', 'Control total del negocio', 1, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('rol_22222222-2222-4222-8222-222222222222', 'org_11111111-1111-4111-8111-111111111111', 'admin', 'Administrador', 'Operación diaria', 1, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('rol_33333333-3333-4333-8333-333333333333', 'org_11111111-1111-4111-8111-111111111111', 'supervisor', 'Supervisor', 'Supervisa cartera y cobros', 1, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('rol_44444444-4444-4444-8444-444444444444', 'org_11111111-1111-4111-8111-111111111111', 'collector', 'Cobrador', 'Gestiona cobros', 1, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('rol_55555555-5555-4555-8555-555555555555', 'org_11111111-1111-4111-8111-111111111111', 'viewer', 'Consulta', 'Solo lectura', 1, CAST(strftime('%s','now') AS INTEGER)*1000);

INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
  SELECT 'rol_11111111-1111-4111-8111-111111111111', key FROM permissions;

INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
  SELECT 'rol_22222222-2222-4222-8222-222222222222', key FROM permissions WHERE key <> 'billing.manage';

INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
  SELECT 'rol_33333333-3333-4333-8333-333333333333', key FROM permissions
   WHERE key IN ('org.read','members.read','clients.read','clients.write','clients.documents',
                 'loans.read','loans.write','loans.adjust','payments.read','payments.write',
                 'collections.read','collections.write','cash.read','cash.write',
                 'reports.read','reports.export','billing.read');

INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
  SELECT 'rol_44444444-4444-4444-8444-444444444444', key FROM permissions
   WHERE key IN ('org.read','clients.read','loans.read','payments.read','payments.write',
                 'collections.read','collections.write','cash.read');

INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
  SELECT 'rol_55555555-5555-4555-8555-555555555555', key FROM permissions
   WHERE key IN ('org.read','clients.read','loans.read','payments.read','collections.read',
                 'cash.read','reports.read','billing.read');

INSERT OR IGNORE INTO organization_members (
  id, org_id, user_id, role_id, status, invited_by, invited_at, accepted_at, created_at, updated_at
) VALUES (
  'mem_11111111-1111-4111-8111-111111111111',
  'org_11111111-1111-4111-8111-111111111111',
  'usr_11111111-1111-4111-8111-111111111111',
  'rol_11111111-1111-4111-8111-111111111111',
  'active', NULL, NULL, CAST(strftime('%s','now') AS INTEGER)*1000,
  CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000
);

INSERT OR IGNORE INTO subscriptions (
  id, org_id, plan_id, status, billing_cycle, trial_ends_at, current_period_start,
  current_period_end, cancel_at_period_end, canceled_at, created_at, updated_at
) VALUES (
  'sub_11111111-1111-4111-8111-111111111111',
  'org_11111111-1111-4111-8111-111111111111',
  'plan_professional',
  'active',
  'monthly',
  NULL,
  CAST(strftime('%s','now') AS INTEGER)*1000,
  (CAST(strftime('%s','now') AS INTEGER) + 30*86400)*1000,
  0, NULL,
  CAST(strftime('%s','now') AS INTEGER)*1000,
  CAST(strftime('%s','now') AS INTEGER)*1000
);

INSERT OR IGNORE INTO settings (id, org_id, key, value_json, updated_by, updated_at) VALUES (
  'set_11111111-1111-4111-8111-111111111111',
  'org_11111111-1111-4111-8111-111111111111',
  'org.preferences',
  '{"defaultLateFeeDailyBps":50,"defaultGraceDays":0,"allocationOrder":["late_fee","interest","principal","fee"],"paymentMethods":["cash","transfer"],"reminderDaysBeforeDue":2}',
  'usr_11111111-1111-4111-8111-111111111111',
  CAST(strftime('%s','now') AS INTEGER)*1000
);

INSERT OR IGNORE INTO sequences (org_id, name, prefix, next_value) VALUES
  ('org_11111111-1111-4111-8111-111111111111', 'client', 'CLI', 4),
  ('org_11111111-1111-4111-8111-111111111111', 'loan', 'PRE', 3);

INSERT OR IGNORE INTO clients (
  id, org_id, code, full_name, identification, phone, email, address, references_json,
  notes, status, created_by, created_at, updated_at, deleted_at
) VALUES
  ('cli_11111111-1111-4111-8111-111111111111', 'org_11111111-1111-4111-8111-111111111111', 'CLI-00001',
   'María José López', '001-200190-0001A', '8888 1111', 'maria.lopez@example.com', 'Barrio San Judas, Managua',
   '[{"name":"Ana López","phone":"8888 2222","relationship":"Hermana"}]', 'Cliente puntual.', 'active',
   'usr_11111111-1111-4111-8111-111111111111', CAST(strftime('%s','now') AS INTEGER)*1000 - 2592000000, CAST(strftime('%s','now') AS INTEGER)*1000, NULL),
  ('cli_22222222-2222-4222-8222-222222222222', 'org_11111111-1111-4111-8111-111111111111', 'CLI-00002',
   'Carlos Mendoza', '001-150285-0002B', '8777 3333', 'carlos.mendoza@example.com', 'Colonia Centroamérica, Managua',
   '[]', 'Solicita crédito cada trimestre.', 'active',
   'usr_11111111-1111-4111-8111-111111111111', CAST(strftime('%s','now') AS INTEGER)*1000 - 1728000000, CAST(strftime('%s','now') AS INTEGER)*1000, NULL),
  ('cli_33333333-3333-4333-8333-333333333333', 'org_11111111-1111-4111-8111-111111111111', 'CLI-00003',
   'Rosa Martínez', '001-180792-0003C', '8666 4444', NULL, 'Municipio de Nindirí, Masaya',
   '[{"name":"Pedro Martínez","phone":"8666 5555","relationship":"Esposo"}]', 'Negocio de pulpería.', 'active',
   'usr_11111111-1111-4111-8111-111111111111', CAST(strftime('%s','now') AS INTEGER)*1000 - 864000000, CAST(strftime('%s','now') AS INTEGER)*1000, NULL);

-- Préstamo A: C$ 50,000 · 4 cuotas mensuales · interés plano 4%
INSERT OR IGNORE INTO loans (
  id, org_id, client_id, code, currency, exchange_rate_micros, principal_cents, interest_rate_bps,
  interest_type, amortization_method, installment_count, frequency, custom_days,
  disbursement_date, first_due_date, total_interest_cents, total_fee_cents, total_to_pay_cents,
  late_fee_daily_bps, grace_days, schedule_version, status, notes, created_by, created_at, updated_at,
  settled_at, deleted_at
) VALUES (
  'lon_11111111-1111-4111-8111-111111111111', 'org_11111111-1111-4111-8111-111111111111',
  'cli_11111111-1111-4111-8111-111111111111', 'PRE-00001', 'NIO', NULL, 5000000, 400,
  'flat', 'flat_interest', 4, 'monthly', NULL,
  '2026-10-05', '2026-11-05', 800000, 0, 5800000,
  50, 0, 1, 'active', 'Capital para ampliación de negocio.',
  'usr_11111111-1111-4111-8111-111111111111',
  CAST(strftime('%s','2026-10-05T15:00:00Z') AS INTEGER)*1000,
  CAST(strftime('%s','now') AS INTEGER)*1000, NULL, NULL
);

-- Préstamo B: C$ 12,000 · 6 cuotas quincenales · capital constante 3%
INSERT OR IGNORE INTO loans (
  id, org_id, client_id, code, currency, exchange_rate_micros, principal_cents, interest_rate_bps,
  interest_type, amortization_method, installment_count, frequency, custom_days,
  disbursement_date, first_due_date, total_interest_cents, total_fee_cents, total_to_pay_cents,
  late_fee_daily_bps, grace_days, schedule_version, status, notes, created_by, created_at, updated_at,
  settled_at, deleted_at
) VALUES (
  'lon_22222222-2222-4222-8222-222222222222', 'org_11111111-1111-4111-8111-111111111111',
  'cli_22222222-2222-4222-8222-222222222222', 'PRE-00002', 'NIO', NULL, 1200000, 300,
  'declining', 'declining_principal', 6, 'biweekly', NULL,
  '2026-10-20', '2026-11-03', 126000, 0, 1326000,
  50, 2, 1, 'active', 'Compra de inventario.',
  'usr_11111111-1111-4111-8111-111111111111',
  CAST(strftime('%s','2026-10-20T15:00:00Z') AS INTEGER)*1000,
  CAST(strftime('%s','now') AS INTEGER)*1000, NULL, NULL
);

INSERT OR IGNORE INTO loan_schedule_versions (id, org_id, loan_id, version, reason, created_by, created_at) VALUES
  ('lsv_11111111-1111-4111-8111-111111111111', 'org_11111111-1111-4111-8111-111111111111', 'lon_11111111-1111-4111-8111-111111111111', 1, 'Calendario inicial', 'usr_11111111-1111-4111-8111-111111111111', CAST(strftime('%s','now') AS INTEGER)*1000),
  ('lsv_22222222-2222-4222-8222-222222222222', 'org_11111111-1111-4111-8111-111111111111', 'lon_22222222-2222-4222-8222-222222222222', 1, 'Calendario inicial', 'usr_11111111-1111-4111-8111-111111111111', CAST(strftime('%s','now') AS INTEGER)*1000);

-- Cuotas del préstamo A (1,250,000 capital + 200,000 interés = 1,450,000)
INSERT OR IGNORE INTO installments (
  id, org_id, loan_id, version, number, due_date, principal_cents, interest_cents, fee_cents, total_cents,
  paid_principal_cents, paid_interest_cents, paid_fee_cents, paid_late_fee_cents, late_fee_accrued_cents,
  status, paid_at, created_at, updated_at
) VALUES
  ('ins_11111111-1111-4111-8111-111111111111', 'org_11111111-1111-4111-8111-111111111111', 'lon_11111111-1111-4111-8111-111111111111', 1, 1, '2026-11-05', 1250000, 200000, 0, 1450000, 1250000, 200000, 0, 0, 0, 'paid', CAST(strftime('%s','2026-11-06T15:00:00Z') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('ins_22222222-2222-4222-8222-222222222222', 'org_11111111-1111-4111-8111-111111111111', 'lon_11111111-1111-4111-8111-111111111111', 1, 2, '2026-12-05', 1250000, 200000, 0, 1450000, 0, 0, 0, 0, 0, 'pending', NULL, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('ins_33333333-3333-4333-8333-333333333333', 'org_11111111-1111-4111-8111-111111111111', 'lon_11111111-1111-4111-8111-111111111111', 1, 3, '2027-01-05', 1250000, 200000, 0, 1450000, 0, 0, 0, 0, 0, 'pending', NULL, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('ins_44444444-4444-4444-8444-444444444444', 'org_11111111-1111-4111-8111-111111111111', 'lon_11111111-1111-4111-8111-111111111111', 1, 4, '2027-02-05', 1250000, 200000, 0, 1450000, 0, 0, 0, 0, 0, 'pending', NULL, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000);

-- Cuotas del préstamo B (capital constante 200,000; interés decreciente)
INSERT OR IGNORE INTO installments (
  id, org_id, loan_id, version, number, due_date, principal_cents, interest_cents, fee_cents, total_cents,
  paid_principal_cents, paid_interest_cents, paid_fee_cents, paid_late_fee_cents, late_fee_accrued_cents,
  status, paid_at, created_at, updated_at
) VALUES
  ('ins_55555555-5555-4555-8555-555555555555', 'org_11111111-1111-4111-8111-111111111111', 'lon_22222222-2222-4222-8222-222222222222', 1, 1, '2026-11-03', 200000, 36000, 0, 236000, 0, 0, 0, 0, 0, 'pending', NULL, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('ins_66666666-6666-4666-8666-666666666666', 'org_11111111-1111-4111-8111-111111111111', 'lon_22222222-2222-4222-8222-222222222222', 1, 2, '2026-11-17', 200000, 30000, 0, 230000, 0, 0, 0, 0, 0, 'pending', NULL, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('ins_77777777-7777-4777-8777-777777777777', 'org_11111111-1111-4111-8111-111111111111', 'lon_22222222-2222-4222-8222-222222222222', 1, 3, '2026-12-01', 200000, 24000, 0, 224000, 0, 0, 0, 0, 0, 'pending', NULL, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('ins_88888888-8888-4888-8888-888888888888', 'org_11111111-1111-4111-8111-111111111111', 'lon_22222222-2222-4222-8222-222222222222', 1, 4, '2026-12-15', 200000, 18000, 0, 218000, 0, 0, 0, 0, 0, 'pending', NULL, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('ins_99999999-9999-4999-8999-999999999999', 'org_11111111-1111-4111-8111-111111111111', 'lon_22222222-2222-4222-8222-222222222222', 1, 5, '2026-12-29', 200000, 12000, 0, 212000, 0, 0, 0, 0, 0, 'pending', NULL, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('ins_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'org_11111111-1111-4111-8111-111111111111', 'lon_22222222-2222-4222-8222-222222222222', 1, 6, '2027-01-12', 200000, 6000, 0, 206000, 0, 0, 0, 0, 0, 'pending', NULL, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000);

INSERT OR IGNORE INTO payments (
  id, org_id, client_id, loan_id, amount_cents, currency, method, reference, paid_at, status, notes,
  created_by, created_at, reversed_at, reversed_by, reversal_reason
) VALUES (
  'pay_11111111-1111-4111-8111-111111111111',
  'org_11111111-1111-4111-8111-111111111111',
  'cli_11111111-1111-4111-8111-111111111111',
  'lon_11111111-1111-4111-8111-111111111111',
  1450000, 'NIO', 'cash', 'REC-0001', '2026-11-06', 'confirmed', 'Pago de primera cuota.',
  'usr_11111111-1111-4111-8111-111111111111',
  CAST(strftime('%s','2026-11-06T15:00:00Z') AS INTEGER)*1000, NULL, NULL, NULL
);

INSERT OR IGNORE INTO payment_allocations (
  id, org_id, payment_id, installment_id, principal_cents, interest_cents, fee_cents, late_fee_cents, created_at
) VALUES (
  'alc_11111111-1111-4111-8111-111111111111',
  'org_11111111-1111-4111-8111-111111111111',
  'pay_11111111-1111-4111-8111-111111111111',
  'ins_11111111-1111-4111-8111-111111111111',
  1250000, 200000, 0, 0,
  CAST(strftime('%s','2026-11-06T15:00:00Z') AS INTEGER)*1000
);

INSERT OR IGNORE INTO cash_registers (
  id, org_id, opened_by, opened_at, closed_by, closed_at, opening_balance_cents,
  expected_balance_cents, counted_balance_cents, difference_cents, status, notes
) VALUES (
  'csh_11111111-1111-4111-8111-111111111111',
  'org_11111111-1111-4111-8111-111111111111',
  'usr_11111111-1111-4111-8111-111111111111',
  CAST(strftime('%s','now') AS INTEGER)*1000,
  NULL, NULL, 5000000, NULL, NULL, NULL, 'open', 'Caja de demostración.'
);

INSERT OR IGNORE INTO cash_movements (
  id, org_id, register_id, direction, category, amount_cents, currency, source_type, source_id, description, created_by, created_at
) VALUES
  ('mov_11111111-1111-4111-8111-111111111111', 'org_11111111-1111-4111-8111-111111111111', 'csh_11111111-1111-4111-8111-111111111111', 'out', 'capital', 5000000, 'NIO', 'loan_disbursement', 'lon_11111111-1111-4111-8111-111111111111', 'Desembolso PRE-00001', 'usr_11111111-1111-4111-8111-111111111111', CAST(strftime('%s','2026-10-05T15:00:00Z') AS INTEGER)*1000),
  ('mov_22222222-2222-4222-8222-222222222222', 'org_11111111-1111-4111-8111-111111111111', 'csh_11111111-1111-4111-8111-111111111111', 'in', 'cuota', 1450000, 'NIO', 'payment', 'pay_11111111-1111-4111-8111-111111111111', 'Primera cuota PRE-00001', 'usr_11111111-1111-4111-8111-111111111111', CAST(strftime('%s','2026-11-06T15:00:00Z') AS INTEGER)*1000);

INSERT OR IGNORE INTO notifications (
  id, org_id, user_id, type, title, body, channel, status, data_json, created_at, sent_at, read_at
) VALUES (
  'ntf_11111111-1111-4111-8111-111111111111',
  'org_11111111-1111-4111-8111-111111111111',
  'usr_11111111-1111-4111-8111-111111111111',
  'welcome',
  'Bienvenido a Credibas',
  'Este negocio de demostración tiene clientes, préstamos y un pago registrados.',
  'in_app', 'sent', '{}',
  CAST(strftime('%s','now') AS INTEGER)*1000,
  CAST(strftime('%s','now') AS INTEGER)*1000,
  NULL
);

INSERT OR IGNORE INTO subscription_events (id, org_id, subscription_id, type, data_json, actor_user_id, created_at) VALUES (
  'sev_11111111-1111-4111-8111-111111111111',
  'org_11111111-1111-4111-8111-111111111111',
  'sub_11111111-1111-4111-8111-111111111111',
  'seed_loaded',
  '{"source":"demo.sql"}',
  'usr_11111111-1111-4111-8111-111111111111',
  CAST(strftime('%s','now') AS INTEGER)*1000
);
