import type { Db } from '../db';
import { newId } from '../lib/crypto';

export interface PaymentMethodRow {
  id: string;
  org_id: string;
  provider: string;
  provider_token_ref: string;
  authorization_ref: string | null;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  holder_name: string | null;
  status: 'active' | 'expired' | 'revoked' | 'failed';
  is_default: number;
  authorized_at: number | null;
  revoked_at: number | null;
  created_at: number;
  updated_at: number;
}

const COLUMNS = `id, org_id, provider, provider_token_ref, authorization_ref, brand, last4,
  exp_month, exp_year, holder_name, status, is_default, authorized_at, revoked_at, created_at, updated_at`;

/** Versión segura para el cliente: nunca incluye el token del proveedor. */
export function toPublicPaymentMethod(row: PaymentMethodRow) {
  return {
    id: row.id,
    provider: row.provider,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    holderName: row.holder_name,
    status: row.status,
    isDefault: row.is_default === 1,
    authorizedAt: row.authorized_at === null ? null : new Date(row.authorized_at).toISOString(),
  };
}

export async function listPaymentMethods(db: Db, orgId: string): Promise<PaymentMethodRow[]> {
  return db.all<PaymentMethodRow>(
    `SELECT ${COLUMNS} FROM payment_methods WHERE org_id = ? ORDER BY is_default DESC, created_at DESC`,
    [orgId],
  );
}

export async function getActivePaymentMethod(db: Db, orgId: string): Promise<PaymentMethodRow | null> {
  return db.first<PaymentMethodRow>(
    `SELECT ${COLUMNS} FROM payment_methods
      WHERE org_id = ? AND status = 'active'
      ORDER BY is_default DESC, created_at DESC LIMIT 1`,
    [orgId],
  );
}

export interface PaymentMethodInput {
  orgId: string;
  provider: string;
  providerTokenRef: string;
  authorizationRef: string | null;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  holderName: string | null;
}

export async function createPaymentMethod(db: Db, input: PaymentMethodInput, now: number): Promise<string> {
  const id = newId('pmt');
  await db.run(
    `INSERT INTO payment_methods (id, org_id, provider, provider_token_ref, authorization_ref, brand, last4,
       exp_month, exp_year, holder_name, status, is_default, authorized_at, revoked_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, NULL, ?, ?)`,
    [
      id,
      input.orgId,
      input.provider,
      input.providerTokenRef,
      input.authorizationRef,
      input.brand,
      input.last4,
      input.expMonth,
      input.expYear,
      input.holderName,
      now,
      now,
      now,
    ],
  );
  return id;
}

/** Revoca el método y lo desasigna de la suscripción, sin borrar el historial. */
export async function revokePaymentMethod(db: Db, orgId: string, id: string, now: number): Promise<number> {
  const result = await db.run(
    `UPDATE payment_methods SET status = 'revoked', revoked_at = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND status = 'active'`,
    [now, now, orgId, id],
  );
  if ((result.meta.changes ?? 0) > 0) {
    await db.run(
      `UPDATE subscriptions SET payment_method_id = NULL, updated_at = ? WHERE org_id = ? AND payment_method_id = ?`,
      [now, orgId, id],
    );
  }
  return result.meta.changes ?? 0;
}
