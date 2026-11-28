/**
 * Contrato del proveedor de pagos. El motor de cobro depende de esta interfaz,
 * nunca de un banco concreto: así el adaptador real (LAFISE) se puede añadir
 * cuando existan contrato y credenciales, sin tocar el resto del sistema.
 */

export interface PaymentMethodRef {
  id: string;
  token: string;
  brand: string | null;
  last4: string | null;
}

export interface ChargeRequest {
  orgId: string;
  amountCents: number;
  currency: string;
  description: string;
  /** Clave estable por suscripción y período: evita cobrar dos veces. */
  idempotencyKey: string;
  method: PaymentMethodRef;
}

export type ChargeStatus = 'succeeded' | 'failed' | 'pending';

export interface ChargeResult {
  status: ChargeStatus;
  providerRef: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface PaymentProvider {
  readonly key: string;
  /**
   * `false` cuando el proveedor no puede cobrar sin intervención humana.
   * En ese caso el motor emite la factura y avisa, pero no intenta el cobro.
   */
  readonly supportsRecurring: boolean;
  charge(request: ChargeRequest): Promise<ChargeResult>;
  getCharge(providerRef: string): Promise<ChargeResult>;
}

/** El proveedor existe pero no está configurado u operativo. */
export class PaymentProviderUnavailable extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentProviderUnavailable';
  }
}
