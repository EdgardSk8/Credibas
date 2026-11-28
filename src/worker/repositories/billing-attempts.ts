import type { Db } from '../db';
import { newId } from '../lib/crypto';

/**
 * Un intento de cobro es una fila de `billing_payments` en estado `pending`
 * hasta que el proveedor responde. Así el historial de pagos y los intentos
 * viven en la misma tabla y no se duplica la facturación.
 */
export interface BillingAttemptRow {
  id: string;
  org_id: string;
  invoice_id: string | null;
  provider: string;
  provider_ref: string | null;
  payment_method_id: string | null;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  idempotency_key: string | null;
  attempt_no: number;
  error_code: string | null;
  error_message: string | null;
  next_retry_at: number | null;
  created_at: number;
}

export interface BillingAttemptView extends BillingAttemptRow {
  org_name: string;
  invoice_number: string | null;
}

const COLUMNS = `id, org_id, invoice_id, provider, provider_ref, payment_method_id, amount_cents, currency,
  status, idempotency_key, attempt_no, error_code, error_message, next_retry_at, created_at`;

export interface CreateAttemptInput {
  orgId: string;
  invoiceId: string | null;
  provider: string;
  paymentMethodId: string | null;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  attemptNo: number;
  request: Record<string, unknown> | null;
}

/** Inserta el intento de forma idempotente: repetir la clave no duplica el cobro. */
export async function createAttempt(db: Db, input: CreateAttemptInput, now: number): Promise<BillingAttemptRow> {
  await db.run(
    `INSERT INTO billing_payments (id, org_id, invoice_id, provider, provider_ref, payment_method_id, amount_cents,
       currency, status, idempotency_key, attempt_no, error_code, error_message, next_retry_at, request_json, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'pending', ?, ?, NULL, NULL, NULL, ?, ?)
     ON CONFLICT DO NOTHING`,
    [
      newId('pay'),
      input.orgId,
      input.invoiceId,
      input.provider,
      input.paymentMethodId,
      input.amountCents,
      input.currency,
      input.idempotencyKey,
      input.attemptNo,
      input.request ? JSON.stringify(input.request) : null,
      now,
    ],
  );

  const row = await db.first<BillingAttemptRow>(
    `SELECT ${COLUMNS} FROM billing_payments WHERE provider = ? AND idempotency_key = ?`,
    [input.provider, input.idempotencyKey],
  );
  if (!row) throw new Error('No se pudo registrar el intento de cobro');
  return row;
}

export async function latestAttemptForInvoice(db: Db, invoiceId: string): Promise<BillingAttemptRow | null> {
  return db.first<BillingAttemptRow>(
    `SELECT ${COLUMNS} FROM billing_payments WHERE invoice_id = ?
      ORDER BY attempt_no DESC, created_at DESC LIMIT 1`,
    [invoiceId],
  );
}

export async function markAttemptSucceeded(
  db: Db,
  id: string,
  providerRef: string,
  raw: Record<string, unknown> | null,
  now: number,
): Promise<void> {
  await db.run(
    `UPDATE billing_payments
        SET status = 'confirmed', provider_ref = ?, raw_json = ?, error_code = NULL, error_message = NULL,
            next_retry_at = NULL, confirmed_at = ?
      WHERE id = ? AND status = 'pending'`,
    [providerRef, raw ? JSON.stringify(raw) : null, now, id],
  );
}

export async function markAttemptFailed(
  db: Db,
  id: string,
  input: { errorCode: string | null; errorMessage: string | null; nextRetryAt: number | null; raw: Record<string, unknown> | null },
): Promise<void> {
  await db.run(
    `UPDATE billing_payments
        SET status = 'failed', error_code = ?, error_message = ?, next_retry_at = ?, raw_json = ?
      WHERE id = ? AND status = 'pending'`,
    [
      input.errorCode,
      input.errorMessage,
      input.nextRetryAt,
      input.raw ? JSON.stringify(input.raw) : null,
      id,
    ],
  );
}

export async function listAttempts(db: Db, status: string | null, limit = 50): Promise<BillingAttemptView[]> {
  const filter = status ? 'AND b.status = ?' : '';
  const params: Array<string | number> = status ? [status, limit] : [limit];
  return db.all<BillingAttemptView>(
    `SELECT b.id, b.org_id, b.invoice_id, b.provider, b.provider_ref, b.payment_method_id, b.amount_cents, b.currency,
            b.status, b.idempotency_key, b.attempt_no, b.error_code, b.error_message, b.next_retry_at, b.created_at,
            o.name AS org_name, i.number AS invoice_number
       FROM billing_payments b
       JOIN organizations o ON o.id = b.org_id
       LEFT JOIN invoices i ON i.id = b.invoice_id
      WHERE b.idempotency_key IS NOT NULL ${filter}
      ORDER BY b.created_at DESC
      LIMIT ?`,
    params,
  );
}

/** Adelanta el reintento de un cobro fallido (acción manual del administrador). */
export async function scheduleAttemptRetry(db: Db, id: string, now: number): Promise<number> {
  const result = await db.run(
    `UPDATE billing_payments SET next_retry_at = ? WHERE id = ? AND status = 'failed'`,
    [now, id],
  );
  return result.meta.changes ?? 0;
}

export async function getAttempt(db: Db, id: string): Promise<BillingAttemptRow | null> {
  return db.first<BillingAttemptRow>(`SELECT ${COLUMNS} FROM billing_payments WHERE id = ?`, [id]);
}
