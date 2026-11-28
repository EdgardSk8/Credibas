import type { Env } from '../../env';
import { PaymentProviderUnavailable, type ChargeResult, type PaymentProvider } from './types';

const REQUIRED_SETTINGS = ['LAFISE_API_BASE', 'LAFISE_MERCHANT_ID', 'LAFISE_API_KEY'] as const;

/** Variables que faltan para operar contra LAFISE (nombres, nunca valores). */
export function missingLafiseSettings(env: Env): string[] {
  return REQUIRED_SETTINGS.filter((name) => !env[name]);
}

/**
 * Adaptador LAFISE.
 *
 * No implementa endpoints porque el banco no publica documentación: ver
 * docs/PAGOS-LAFISE.md §1 (`api.lafise.com` responde 403 y no existe portal de
 * desarrolladores). Cuando haya contrato y credenciales, `charge()` y
 * `getCharge()` se completan aquí sin tocar el resto del motor.
 */
export function createLafiseProvider(env: Env): PaymentProvider {
  const configured = missingLafiseSettings(env).length === 0;

  return {
    key: 'lafise',
    // Sin credenciales se comporta como `manual`: factura y aviso, sin cobro.
    supportsRecurring: configured,
    async charge(): Promise<ChargeResult> {
      throw new PaymentProviderUnavailable(
        configured ? 'lafise_adapter_pending' : 'lafise_not_configured',
        configured
          ? 'El adaptador de LAFISE está pendiente: falta el contrato de API del banco.'
          : 'Faltan credenciales de LAFISE para cobrar con tarjeta.',
      );
    },
    async getCharge(): Promise<ChargeResult> {
      throw new PaymentProviderUnavailable(
        'lafise_adapter_pending',
        'La consulta de transacciones de LAFISE no está disponible sin documentación oficial.',
      );
    },
  };
}
