#!/usr/bin/env node
/**
 * Genera `seeds/demo.sql`: datos de demostración completos para la cuenta
 * Financiera Demo. Re-ejecutable con `npm run db:seed:build`.
 *
 * Las fechas se emiten como expresiones relativas a `date('now')`, así que el
 * seed siempre queda "fresco" respecto al día en que se aplica.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ORG = 'org_11111111-1111-4111-8111-111111111111';
const USR_OWNER = 'usr_11111111-1111-4111-8111-111111111111';
const USR_GUEST = 'usr_99999999-9999-4999-8999-999999999999';
const USR_SUPERVISOR = 'usr_66666666-6666-4666-8666-666666666666';
const USR_COLLECTOR = 'usr_77777777-7777-4777-8777-777777777777';

const ROL_OWNER = 'rol_11111111-1111-4111-8111-111111111111';
const ROL_ADMIN = 'rol_22222222-2222-4222-8222-222222222222';
const ROL_SUPERVISOR = 'rol_33333333-3333-4333-8333-333333333333';
const ROL_COLLECTOR = 'rol_44444444-4444-4444-8444-444444444444';
const ROL_VIEWER = 'rol_55555555-5555-4555-8555-555555555555';

const MEM_OWNER = 'mem_11111111-1111-4111-8111-111111111111';
const MEM_GUEST = 'mem_99999999-9999-4999-8999-999999999999';
const MEM_SUPERVISOR = 'mem_66666666-6666-4666-8666-666666666666';
const MEM_COLLECTOR = 'mem_77777777-7777-4777-8777-777777777777';

const id = (prefix, n) => `${prefix}_${String(n).padStart(4, '0')}0000-0000-4000-8000-000000000000`;
const q = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);

/** Fecha relativa a hoy: `date('now','-5 days')`. */
const day = (offset) => `date('now','${offset >= 0 ? '+' : ''}${offset} days')`;
/** Epoch en milisegundos de un día relativo, con hora fija. */
const stamp = (offset, hour = 10) =>
  `(CAST(strftime('%s', ${day(offset)}) AS INTEGER) * 1000 + ${hour * 3600 * 1000})`;

const PERIOD_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };

const CLIENTS = [
  { name: 'María José López', id: '001-200190-0001A', phone: '8888 1111', mail: 'maria.lopez@example.com', address: 'Barrio San Judas, Managua', notes: 'Cliente puntual. Negocio de ropa.' },
  { name: 'Carlos Mendoza', id: '001-150285-0002B', phone: '8777 3333', mail: 'carlos.mendoza@example.com', address: 'Colonia Centroamérica, Managua', notes: 'Solicita crédito cada trimestre.' },
  { name: 'Rosa Martínez', id: '001-180792-0003C', phone: '8666 4444', mail: null, address: 'Municipio de Nindirí, Masaya', notes: 'Pulpería; paga en efectivo.' },
  { name: 'Juan Ramón Pérez', id: '001-110388-0004D', phone: '8555 1212', mail: 'juan.perez@example.com', address: 'Barrio El Recreo, Managua', notes: 'Transportista.' },
  { name: 'Ana Lucía Gutiérrez', id: '001-220695-0005E', phone: '8444 9898', mail: 'ana.gutierrez@example.com', address: 'León, sector Sutiava', notes: 'Venta de comida.' },
  { name: 'Pedro Antonio Silva', id: '001-090780-0006F', phone: '8333 4545', mail: null, address: 'Estelí, barrio El Rosario', notes: 'Taller de motos.' },
  { name: 'Karla Vanessa Rojas', id: '001-250199-0007G', phone: '8222 6767', mail: 'karla.rojas@example.com', address: 'Masaya, barrio San Jerónimo', notes: 'Artesanías.' },
  { name: 'Miguel Ángel Torres', id: '001-130682-0008H', phone: '8111 7070', mail: 'miguel.torres@example.com', address: 'Granada, barrio La Pólvora', notes: 'Cliente con buen historial.' },
  { name: 'Silvia Elena Cruz', id: '001-170993-0009I', phone: '8999 8181', mail: null, address: 'Matagalpa, barrio El Progreso', notes: 'Café de patio.' },
  { name: 'José Luis Herrera', id: '001-120475-0010J', phone: '8890 9393', mail: 'jose.herrera@example.com', address: 'Chinandega, barrio Santa Ana', notes: 'Ferretería.' },
  { name: 'Martha Cecilia Núñez', id: '001-210188-0011K', phone: '8781 0505', mail: 'martha.nunez@example.com', address: 'Jinotepe, Carazo', notes: 'Farmacia pequeña.' },
  { name: 'Óscar Danilo Vargas', id: '001-160779-0012L', phone: '8672 1616', mail: null, address: 'Rivas, barrio San Pedro', notes: 'Pesca y comercio.' },
];

/**
 * Préstamos de la demo. `paid` = cuotas totalmente pagadas,
 * `partialAt` = índice de la cuota pagada a medias.
 */
const LOANS = [
  { client: 0, code: 'PRE-00003', principal: 5_000_000, rate: 400, type: 'flat', count: 4, freq: 'monthly', firstDue: -70, paid: 1, partialAt: 1, status: 'active', late: 50, grace: 0, notes: 'Capital para ampliación de negocio.' },
  { client: 1, code: 'PRE-00004', principal: 1_200_000, rate: 300, type: 'declining', count: 6, freq: 'biweekly', firstDue: -56, paid: 3, partialAt: -1, status: 'active', late: 50, grace: 2, notes: 'Compra de inventario.' },
  { client: 2, code: 'PRE-00005', principal: 800_000, rate: 500, type: 'flat', count: 10, freq: 'weekly', firstDue: -63, paid: 8, partialAt: -1, status: 'active', late: 100, grace: 0, notes: 'Mercadería para pulpería.' },
  { client: 3, code: 'PRE-00006', principal: 3_000_000, rate: 250, type: 'declining', count: 12, freq: 'monthly', firstDue: -150, paid: 4, partialAt: -1, status: 'active', late: 50, grace: 1, notes: 'Reparación de camión.' },
  { client: 4, code: 'PRE-00007', principal: 500_000, rate: 600, type: 'flat', count: 6, freq: 'biweekly', firstDue: -49, paid: 2, partialAt: 2, status: 'active', late: 100, grace: 0, notes: 'Capital de trabajo para comedor.' },
  { client: 5, code: 'PRE-00008', principal: 6_000_000, rate: 200, type: 'declining', count: 18, freq: 'monthly', firstDue: -240, paid: 7, partialAt: -1, status: 'active', late: 50, grace: 2, notes: 'Equipo para taller.' },
  { client: 6, code: 'PRE-00009', principal: 1_500_000, rate: 450, type: 'flat', count: 6, freq: 'monthly', firstDue: -95, paid: 2, partialAt: -1, status: 'active', late: 50, grace: 0, notes: 'Compra de materia prima.' },
  { client: 7, code: 'PRE-00010', principal: 2_500_000, rate: 300, type: 'declining', count: 10, freq: 'biweekly', firstDue: -180, paid: 10, partialAt: -1, status: 'settled', late: 50, grace: 1, notes: 'Crédito liquidado en fecha.' },
  { client: 8, code: 'PRE-00011', principal: 900_000, rate: 500, type: 'flat', count: 8, freq: 'weekly', firstDue: -84, paid: 2, partialAt: -1, status: 'defaulted', late: 120, grace: 0, notes: 'Cliente con atraso; en gestión de cobro.' },
  { client: 9, code: 'PRE-00012', principal: 4_500_000, rate: 220, type: 'declining', count: 12, freq: 'monthly', firstDue: -120, paid: 3, partialAt: 3, status: 'active', late: 50, grace: 2, notes: 'Inventario de ferretería.' },
  { client: 10, code: 'PRE-00013', principal: 750_000, rate: 400, type: 'flat', count: 4, freq: 'monthly', firstDue: -150, paid: 4, partialAt: -1, status: 'settled', late: 50, grace: 0, notes: 'Crédito corto, pagado completo.' },
  { client: 11, code: 'PRE-00014', principal: 10_000_000, rate: 180, type: 'declining', count: 24, freq: 'monthly', firstDue: -90, paid: 3, partialAt: -1, status: 'active', late: 50, grace: 3, notes: 'Capital para flota de pesca.' },
];

function buildSchedule(loan) {
  const rows = [];
  if (loan.type === 'flat') {
    const interest = Math.round((loan.principal * loan.rate) / 10_000);
    const base = Math.floor(loan.principal / loan.count);
    for (let k = 0; k < loan.count; k += 1) {
      const isLast = k === loan.count - 1;
      rows.push({ principal: isLast ? loan.principal - base * (loan.count - 1) : base, interest });
    }
  } else {
    let remaining = loan.principal;
    const base = Math.floor(loan.principal / loan.count);
    for (let k = 0; k < loan.count; k += 1) {
      const isLast = k === loan.count - 1;
      const principal = isLast ? remaining : base;
      rows.push({ principal, interest: Math.round((remaining * loan.rate) / 10_000) });
      remaining -= principal;
    }
  }

  const period = PERIOD_DAYS[loan.freq];
  return rows.map((row, index) => {
    const dueOffset = loan.firstDue + index * period;
    const paidFull = index < loan.paid;
    const partial = index === loan.partialAt;
    const paidPrincipal = paidFull ? row.principal : partial ? Math.round(row.principal * 0.4) : 0;
    const paidInterest = paidFull ? row.interest : partial ? Math.round(row.interest * 0.4) : 0;
    const status = paidFull ? 'paid' : partial ? 'partial' : dueOffset < 0 ? 'overdue' : 'pending';
    const lateFee = status === 'overdue' ? Math.round(((row.principal + row.interest) * loan.late) / 10_000) : 0;
    return {
      number: index + 1,
      dueOffset,
      principal: row.principal,
      interest: row.interest,
      total: row.principal + row.interest,
      paidPrincipal,
      paidInterest,
      status,
      lateFee,
      payment: paidFull || partial ? paidPrincipal + paidInterest : 0,
    };
  });
}

const lines = [];
const push = (text = '') => lines.push(text);

push('-- =============================================================================');
push('-- CREDIBAS — Datos de demostración');
push('-- Generado por scripts/generate-demo-seed.mjs — no editar a mano.');
push('-- Cuenta local: demo@credibas.app / Demo2026x (administrador de plataforma)');
push('-- Cuenta pública de demo: demo.invitado@credibas.app (solo lectura, sin contraseña útil)');
push('-- Borra y reconstruye SOLO los datos de la organización de demostración.');
push('-- =============================================================================');
push();
push('PRAGMA foreign_keys = ON;');
push();

// --- Limpieza acotada a la organización de demo ---------------------------------
const ORG_TABLES = [
  'collection_activities',
  'collection_assignments',
  'cash_movements',
  'cash_registers',
  'payment_allocations',
  'payments',
  'installments',
  'loan_schedule_versions',
  'loans',
  'client_documents',
  'clients',
  'notifications',
  'invoices',
  'billing_payments',
  'subscription_events',
  'subscriptions',
  'organization_members',
  'settings',
  'sequences',
];
/** Tablas que cuelgan de la suscripción, no de la organización. */
const SUBSCRIPTION_TABLES = ['subscription_modules', 'subscription_addons', 'subscription_change_history'];

push('-- Reconstrucción limpia de la demostración');
for (const table of SUBSCRIPTION_TABLES) {
  push(`DELETE FROM ${table} WHERE subscription_id IN (SELECT id FROM subscriptions WHERE org_id = ${q(ORG)});`);
}
for (const table of ORG_TABLES) push(`DELETE FROM ${table} WHERE org_id = ${q(ORG)};`);
push(`DELETE FROM roles WHERE org_id = ${q(ORG)};`);
push();

// --- Usuarios -------------------------------------------------------------------
const now = `(CAST(strftime('%s','now') AS INTEGER) * 1000)`;
const users = [
  [USR_OWNER, 'demo@credibas.app', 'Demo Credibas', 1, 'Spiz7Ng83ZGEztoOaUUTHXVQCEOWv9X1du7FNSKbstk=', 'M+que3aO7QFDhOKO3EczJQ==', 600000],
  [USR_GUEST, 'demo.invitado@credibas.app', 'Visitante Demo', 0, 'bm8tdXNhci1lc3RhLWN1ZW50YQ==', 'c2FsdC1pbnZpdGFkbw==', 600000],
  [USR_SUPERVISOR, 'supervisor@credibas.app', 'Lucía Ramírez', 0, 'bm8tdXNhci1lc3RhLWN1ZW50YQ==', 'c2FsdC1zdXBlcnZpc29y', 600000],
  [USR_COLLECTOR, 'cobrador@credibas.app', 'Ernesto Ruiz', 0, 'bm8tdXNhci1lc3RhLWN1ZW50YQ==', 'c2FsdC1jb2JyYWRvcg==', 600000],
];
push('-- Usuarios');
for (const [uid, email, name, admin, hash, salt, iterations] of users) {
  push(
    `INSERT OR IGNORE INTO users (id, email, full_name, password_hash, password_salt, password_iterations, email_verified_at, is_platform_admin, status, last_login_at, created_at, updated_at) VALUES (${q(uid)}, ${q(email)}, ${q(name)}, ${q(hash)}, ${q(salt)}, ${iterations}, ${now}, ${admin}, 'active', NULL, ${now}, ${now});`,
  );
}
push();

// --- Organización ---------------------------------------------------------------
push('-- Organización');
push(`INSERT OR IGNORE INTO organizations (id, name, slug, owner_user_id, currency, timezone, date_format, locale, logo_r2_key, status, created_at, updated_at) VALUES (${q(ORG)}, 'Financiera Demo', 'financiera-demo', ${q(USR_OWNER)}, 'NIO', 'America/Managua', 'dd/MM/yyyy', 'es-NI', NULL, 'active', ${now}, ${now});`);
push();

// --- Roles y permisos -----------------------------------------------------------
const roles = [
  [ROL_OWNER, 'owner', 'Propietario', 'Control total del negocio'],
  [ROL_ADMIN, 'admin', 'Administrador', 'Operación diaria'],
  [ROL_SUPERVISOR, 'supervisor', 'Supervisor', 'Supervisa cartera y cobros'],
  [ROL_COLLECTOR, 'collector', 'Cobrador', 'Gestiona cobros'],
  [ROL_VIEWER, 'viewer', 'Consulta', 'Solo lectura'],
];
push('-- Roles');
for (const [rid, key, name, description] of roles) {
  push(`INSERT OR IGNORE INTO roles (id, org_id, key, name, description, is_system, created_at) VALUES (${q(rid)}, ${q(ORG)}, ${q(key)}, ${q(name)}, ${q(description)}, 1, ${now});`);
}
push(`INSERT OR IGNORE INTO role_permissions (role_id, permission_key) SELECT ${q(ROL_OWNER)}, key FROM permissions;`);
push(`INSERT OR IGNORE INTO role_permissions (role_id, permission_key) SELECT ${q(ROL_ADMIN)}, key FROM permissions WHERE key <> 'billing.manage';`);
push(`INSERT OR IGNORE INTO role_permissions (role_id, permission_key) SELECT ${q(ROL_SUPERVISOR)}, key FROM permissions WHERE key IN ('org.read','members.read','clients.read','clients.write','clients.documents','loans.read','loans.write','loans.adjust','payments.read','payments.write','collections.read','collections.write','cash.read','cash.write','reports.read','reports.export','billing.read');`);
push(`INSERT OR IGNORE INTO role_permissions (role_id, permission_key) SELECT ${q(ROL_COLLECTOR)}, key FROM permissions WHERE key IN ('org.read','clients.read','loans.read','payments.read','payments.write','collections.read','collections.write','cash.read');`);
push(`INSERT OR IGNORE INTO role_permissions (role_id, permission_key) SELECT ${q(ROL_VIEWER)}, key FROM permissions WHERE key IN ('org.read','clients.read','loans.read','payments.read','collections.read','cash.read','reports.read','billing.read');`);
push();

push('-- Miembros del equipo');
const members = [
  [MEM_OWNER, USR_OWNER, ROL_OWNER],
  [MEM_GUEST, USR_GUEST, ROL_OWNER],
  [MEM_SUPERVISOR, USR_SUPERVISOR, ROL_SUPERVISOR],
  [MEM_COLLECTOR, USR_COLLECTOR, ROL_COLLECTOR],
];
for (const [mid, uid, rid] of members) {
  push(`INSERT OR IGNORE INTO organization_members (id, org_id, user_id, role_id, status, invited_by, invited_at, accepted_at, created_at, updated_at) VALUES (${q(mid)}, ${q(ORG)}, ${q(uid)}, ${q(rid)}, 'active', NULL, NULL, ${now}, ${now}, ${now});`);
}
push();

// --- Suscripción, preferencias y secuencias --------------------------------------
push('-- Suscripción y configuración');
push(`INSERT OR IGNORE INTO subscriptions (id, org_id, plan_id, status, billing_cycle, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at, updated_at, grace_ends_at) VALUES ('sub_11111111-1111-4111-8111-111111111111', ${q(ORG)}, 'plan_professional', 'active', 'monthly', NULL, ${stamp(-28)}, ${stamp(2)}, 0, NULL, ${stamp(-28)}, ${now}, ${stamp(5)});`);
push(`INSERT OR IGNORE INTO settings (id, org_id, key, value_json, updated_by, updated_at) VALUES ('set_11111111-1111-4111-8111-111111111111', ${q(ORG)}, 'org.preferences', '{"defaultLateFeeDailyBps":50,"defaultGraceDays":0,"allocationOrder":["late_fee","interest","principal","fee"],"paymentMethods":["cash","transfer"],"reminderDaysBeforeDue":2}', ${q(USR_OWNER)}, ${now});`);
push(`INSERT OR IGNORE INTO sequences (org_id, name, prefix, next_value) VALUES (${q(ORG)}, 'client', 'CLI', ${CLIENTS.length + 1}), (${q(ORG)}, 'loan', 'PRE', ${LOANS.length + 3});`);
push();

// --- Clientes -------------------------------------------------------------------
push('-- Clientes');
CLIENTS.forEach((client, index) => {
  const refs =
    index % 3 === 0
      ? q(JSON.stringify([{ name: 'Familiar directo', phone: '8888 0000', relationship: 'Familiar' }]))
      : "'[]'";
  push(
    `INSERT INTO clients (id, org_id, code, full_name, identification, phone, email, address, references_json, notes, status, created_by, created_at, updated_at, deleted_at) VALUES (${q(id('cli', index + 1))}, ${q(ORG)}, ${q(`CLI-${String(index + 1).padStart(5, '0')}`)}, ${q(client.name)}, ${q(client.id)}, ${q(client.phone)}, ${q(client.mail)}, ${q(client.address)}, ${refs}, ${q(client.notes)}, 'active', ${q(USR_OWNER)}, ${stamp(-120 + index)}, ${now}, NULL);`,
  );
});
push();

// --- Préstamos, calendario, pagos y caja ----------------------------------------
let paymentSeq = 1;
let allocationSeq = 1;
const registerWindow = { first: 'reg_11111111-1111-4111-8111-111111111111', second: 'reg_22222222-2222-4222-8222-222222222222' };

push('-- Cajas');
push(`INSERT OR IGNORE INTO cash_registers (id, org_id, opened_by, opened_at, closed_by, closed_at, opening_balance_cents, expected_balance_cents, counted_balance_cents, difference_cents, status, notes) VALUES (${q(registerWindow.first)}, ${q(ORG)}, ${q(USR_OWNER)}, ${stamp(-40, 8)}, ${q(USR_OWNER)}, ${stamp(-20, 18)}, 200000, NULL, NULL, NULL, 'closed', 'Cierre de quincena anterior');`);
push(`INSERT OR IGNORE INTO cash_registers (id, org_id, opened_by, opened_at, closed_by, closed_at, opening_balance_cents, expected_balance_cents, counted_balance_cents, difference_cents, status, notes) VALUES (${q(registerWindow.second)}, ${q(ORG)}, ${q(USR_OWNER)}, ${stamp(-19, 8)}, NULL, NULL, 350000, NULL, NULL, NULL, 'open', 'Caja del período actual');`);
push();

push('-- Préstamos');
LOANS.forEach((loan, index) => {
  const loanId = id('lon', index + 3);
  const schedule = buildSchedule(loan);
  const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);
  const total = loan.principal + totalInterest;
  const settled = loan.status === 'settled';
  push();
  push(`-- ${loan.code}: ${CLIENTS[loan.client].name}`);
  push(
    `INSERT INTO loans (id, org_id, client_id, code, currency, exchange_rate_micros, principal_cents, interest_rate_bps, interest_type, amortization_method, installment_count, frequency, custom_days, disbursement_date, first_due_date, total_interest_cents, total_fee_cents, total_to_pay_cents, late_fee_daily_bps, grace_days, schedule_version, status, notes, created_by, created_at, updated_at, settled_at, deleted_at) VALUES (${q(loanId)}, ${q(ORG)}, ${q(id('cli', loan.client + 1))}, ${q(loan.code)}, 'NIO', NULL, ${loan.principal}, ${loan.rate}, ${q(loan.type)}, ${q(loan.type === 'flat' ? 'flat_interest' : 'declining_principal')}, ${loan.count}, ${q(loan.freq)}, NULL, ${day(loan.firstDue - PERIOD_DAYS[loan.freq])}, ${day(loan.firstDue)}, ${totalInterest}, 0, ${total}, ${loan.late}, ${loan.grace}, 1, ${q(loan.status)}, ${q(loan.notes)}, ${q(USR_OWNER)}, ${stamp(loan.firstDue - PERIOD_DAYS[loan.freq])}, ${now}, ${settled ? stamp(-5) : 'NULL'}, NULL);`,
  );
  push(
    `INSERT INTO loan_schedule_versions (id, org_id, loan_id, version, reason, created_by, created_at) VALUES (${q(id('lsv', index + 3))}, ${q(ORG)}, ${q(loanId)}, 1, 'Calendario inicial', ${q(USR_OWNER)}, ${stamp(loan.firstDue - PERIOD_DAYS[loan.freq])});`,
  );

  schedule.forEach((row) => {
    const installmentId = `${loanId.replace('lon_', 'ins_')}_${row.number}`;
    const paidAt = row.payment > 0 ? stamp(Math.min(row.dueOffset + 1, 0)) : 'NULL';
    const paidPrincipal = row.paidPrincipal;
    const paidInterest = row.paidInterest;
    push(
      `INSERT INTO installments (id, org_id, loan_id, version, number, due_date, principal_cents, interest_cents, fee_cents, total_cents, paid_principal_cents, paid_interest_cents, paid_fee_cents, paid_late_fee_cents, late_fee_accrued_cents, status, paid_at, created_at, updated_at) VALUES (${q(installmentId)}, ${q(ORG)}, ${q(loanId)}, 1, ${row.number}, ${day(row.dueOffset)}, ${row.principal}, ${row.interest}, 0, ${row.total}, ${paidPrincipal}, ${paidInterest}, 0, 0, ${row.lateFee}, ${q(row.status)}, ${paidAt}, ${stamp(loan.firstDue - PERIOD_DAYS[loan.freq])}, ${now});`,
    );

    if (row.payment > 0) {
      const paymentId = id('pay', paymentSeq);
      paymentSeq += 1;
      const payOffset = Math.min(row.dueOffset + 1, 0);
      const method = paymentSeq % 4 === 0 ? 'transfer' : 'cash';
      push(
        `INSERT INTO payments (id, org_id, client_id, loan_id, amount_cents, currency, method, reference, paid_at, status, notes, created_by, created_at, reversed_at, reversed_by, reversal_reason) VALUES (${q(paymentId)}, ${q(ORG)}, ${q(id('cli', loan.client + 1))}, ${q(loanId)}, ${row.payment}, 'NIO', ${q(method)}, NULL, ${day(payOffset)}, 'confirmed', ${q(`Cuota ${row.number}`)}, ${q(USR_OWNER)}, ${stamp(payOffset, 11)}, NULL, NULL, NULL);`,
      );
      push(
        `INSERT INTO payment_allocations (id, org_id, payment_id, installment_id, principal_cents, interest_cents, fee_cents, late_fee_cents, created_at) VALUES (${q(id('all', allocationSeq))}, ${q(ORG)}, ${q(paymentId)}, ${q(installmentId)}, ${paidPrincipal}, ${paidInterest}, 0, 0, ${stamp(payOffset, 11)});`,
      );
      allocationSeq += 1;
      const registerId = payOffset <= -20 ? registerWindow.first : registerWindow.second;
      push(
        `INSERT INTO cash_movements (id, org_id, register_id, direction, category, amount_cents, currency, source_type, source_id, description, created_by, created_at) VALUES (${q(id('cmv', paymentSeq))}, ${q(ORG)}, ${q(registerId)}, 'in', 'payment', ${row.payment}, 'NIO', 'payment', ${q(paymentId)}, ${q(`Cobro ${loan.code} cuota ${row.number}`)}, ${q(USR_OWNER)}, ${stamp(payOffset, 11)});`,
      );
    }
  });
});
push();

// --- Caja -----------------------------------------------------------------------
push('-- Caja: movimientos manuales del período');
push(`INSERT INTO cash_movements (id, org_id, register_id, direction, category, amount_cents, currency, source_type, source_id, description, created_by, created_at) VALUES (${q(id('cmv', 9001))}, ${q(ORG)}, ${q(registerWindow.second)}, 'out', 'expense', 45000, 'NIO', 'expense', NULL, 'Combustible para cobros', ${q(USR_OWNER)}, ${stamp(-10, 9)});`);
push(`INSERT INTO cash_movements (id, org_id, register_id, direction, category, amount_cents, currency, source_type, source_id, description, created_by, created_at) VALUES (${q(id('cmv', 9002))}, ${q(ORG)}, ${q(registerWindow.second)}, 'out', 'expense', 120000, 'NIO', 'expense', NULL, 'Papelería y recibos', ${q(USR_OWNER)}, ${stamp(-6, 15)});`);
push();

// --- Cobros ---------------------------------------------------------------------
push('-- Gestión de cobro');
push(`INSERT INTO collection_assignments (id, org_id, client_id, loan_id, collector_member_id, status, next_contact_at, notes, created_by, created_at, updated_at) VALUES (${q(id('cas', 1))}, ${q(ORG)}, ${q(id('cli', 9))}, ${q(id('lon', 11))}, ${q(MEM_COLLECTOR)}, 'active', ${day(-1)}, 'Cliente con dos cuotas vencidas.', ${q(USR_OWNER)}, ${stamp(-15)}, ${now});`);
push(`INSERT INTO collection_assignments (id, org_id, client_id, loan_id, collector_member_id, status, next_contact_at, notes, created_by, created_at, updated_at) VALUES (${q(id('cas', 2))}, ${q(ORG)}, ${q(id('cli', 5))}, ${q(id('lon', 7))}, ${q(MEM_COLLECTOR)}, 'active', ${day(2)}, 'Prometió abono parcial el viernes.', ${q(USR_OWNER)}, ${stamp(-9)}, ${now});`);
push(`INSERT INTO collection_assignments (id, org_id, client_id, loan_id, collector_member_id, status, next_contact_at, notes, created_by, created_at, updated_at) VALUES (${q(id('cas', 3))}, ${q(ORG)}, ${q(id('cli', 4))}, ${q(id('lon', 6))}, ${q(MEM_SUPERVISOR)}, 'paused', NULL, 'Al día tras refinanciamiento.', ${q(USR_OWNER)}, ${stamp(-30)}, ${now});`);

const activities = [
  [1, 9, 11, 'visit', 'no_contacto', 'No se encontró al cliente en el negocio.', null, null, -6],
  [1, 9, 11, 'call', 'promesa', 'Prometió abonar el lunes.', 250000, -3, -5],
  [1, 9, 11, 'message', 'enviado', 'Recordatorio por WhatsApp.', null, null, -2],
  [2, 5, 7, 'call', 'promesa', 'Abonará parte de la cuota el viernes.', 120000, 2, -4],
  [2, 5, 7, 'visit', 'cobro_parcial', 'Se recibió abono en efectivo.', null, null, -12],
  [null, 1, 3, 'note', 'seguimiento', 'Cliente solicita ampliación de plazo.', null, null, -20],
];
activities.forEach(([assignment, client, loan, type, outcome, notes, promiseAmount, promiseDate, offset], index) => {
  push(
    `INSERT INTO collection_activities (id, org_id, assignment_id, client_id, loan_id, type, outcome, notes, promise_amount_cents, promise_date, created_by, created_at) VALUES (${q(id('cat', index + 1))}, ${q(ORG)}, ${assignment === null ? 'NULL' : q(id('cas', assignment))}, ${q(id('cli', client))}, ${q(id('lon', loan))}, ${q(type)}, ${q(outcome)}, ${q(notes)}, ${promiseAmount ?? 'NULL'}, ${promiseDate === null ? 'NULL' : day(promiseDate)}, ${q(USR_COLLECTOR)}, ${stamp(offset, 15)});`,
  );
});
push();

// --- Notificaciones -------------------------------------------------------------
push('-- Notificaciones');
const notifications = [
  ['installment_reminder', '3 cuotas vencen en 2 días', 'Revisa la agenda de cobros de la semana.', -1, 0],
  ['overdue_digest', '2 cuotas vencidas', 'Hay 2 cuotas vencidas por C$ 2,450.00.', -2, 0],
  ['collection_assignment', 'Nueva cartera asignada', 'Se te asignaron 2 clientes para gestión de cobro.', -9, 1],
  ['payment_confirmed', 'Pago registrado', 'Se registró un pago de C$ 1,450.00 en PRE-00003.', -12, 0],
  ['billing_payment_approved', 'Pago confirmado', 'Cobramos USD 24.90 de tu plan Professional.', -28, 0],
];
notifications.forEach(([type, title, body, offset, read], index) => {
  push(
    `INSERT INTO notifications (id, org_id, user_id, type, title, body, channel, status, data_json, created_at, sent_at, read_at) VALUES (${q(id('ntf', index + 1))}, ${q(ORG)}, ${q(USR_OWNER)}, ${q(type)}, ${q(title)}, ${q(body)}, 'in_app', ${q(read ? 'read' : 'sent')}, '{}', ${stamp(offset, 9)}, ${stamp(offset, 9)}, ${read ? stamp(offset, 10) : 'NULL'});`,
  );
});
push();

// --- Facturación ----------------------------------------------------------------
push('-- Facturación de la suscripción');
for (let index = 0; index < 3; index += 1) {
  const invoiceId = id('inv', index + 1);
  const number = `CRB-DEMO-${String(index + 1).padStart(4, '0')}`;
  push(
    `INSERT INTO invoices (id, org_id, subscription_id, number, amount_cents, currency, status, period_start, period_end, issued_at, due_at, paid_at, notes, created_at) VALUES (${q(invoiceId)}, ${q(ORG)}, 'sub_11111111-1111-4111-8111-111111111111', ${q(number)}, 2490, 'USD', 'paid', ${stamp(-28 * (index + 1))}, ${stamp(-28 * index)}, ${stamp(-28 * (index + 1))}, ${stamp(-28 * (index + 1) + 3)}, ${stamp(-28 * (index + 1) + 1)}, ${q('Plan Professional · mensual')}, ${stamp(-28 * (index + 1))});`,
  );
  push(
    `INSERT INTO billing_payments (id, org_id, invoice_id, provider, provider_ref, amount_cents, currency, status, proof_r2_key, raw_json, confirmed_by, confirmed_at, created_at) VALUES (${q(id('bpy', index + 1))}, ${q(ORG)}, ${q(invoiceId)}, 'manual', ${q(`demo-ref-${index + 1}`)}, 2490, 'USD', 'confirmed', NULL, NULL, ${q(USR_OWNER)}, ${stamp(-28 * (index + 1) + 1)}, ${stamp(-28 * (index + 1) + 1)});`,
  );
}
push(`INSERT INTO subscription_events (id, org_id, subscription_id, type, data_json, actor_user_id, created_at) VALUES (${q(id('sev', 1))}, ${q(ORG)}, 'sub_11111111-1111-4111-8111-111111111111', 'plan_activated', '{"planKey":"professional"}', ${q(USR_OWNER)}, ${stamp(-28)});`);
push();

const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'demo.sql');
writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');

const installments = LOANS.reduce((sum, loan) => sum + loan.count, 0);
console.log(`seeds/demo.sql generado: ${CLIENTS.length} clientes, ${LOANS.length} préstamos, ${installments} cuotas.`);
