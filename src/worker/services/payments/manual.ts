import { PaymentProviderUnavailable, type ChargeRequest, type ChargeResult, type PaymentProvider } from './types';

/**
 * Proveedor `manual`: el comportamiento actual del producto. Genera la factura
 * del período y avisa al prestamista, pero no cobra automáticamente; el
 * administrador confirma el pago cuando recibe la transferencia o el comprobante.
 */
export function createManualProvider(): PaymentProvider {
  return {
    key: 'manual',
    supportsRecurring: false,
    async charge(_request: ChargeRequest): Promise<ChargeResult> {
      throw new PaymentProviderUnavailable(
        'manual_no_auto_charge',
        'El proveedor manual no realiza cobros automáticos: requiere confirmación humana.',
      );
    },
    async getCharge(_providerRef: string): Promise<ChargeResult> {
      throw new PaymentProviderUnavailable(
        'manual_no_auto_charge',
        'El proveedor manual no consulta transacciones bancarias.',
      );
    },
  };
}
