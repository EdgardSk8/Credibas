import type { Env } from '../../env';
import { createLafiseProvider, missingLafiseSettings } from './lafise';
import { createManualProvider } from './manual';
import type { PaymentProvider } from './types';

export { PaymentProviderUnavailable } from './types';
export type { ChargeRequest, ChargeResult, PaymentMethodRef, PaymentProvider } from './types';

export type PaymentProviderKey = 'manual' | 'lafise';

/** Resuelve el proveedor configurado en `PAYMENTS_PROVIDER`; `manual` por defecto. */
export function resolvePaymentProvider(env: Env): PaymentProvider {
  const key = (env.PAYMENTS_PROVIDER ?? 'manual').trim().toLowerCase();
  if (key === 'lafise') return createLafiseProvider(env);
  return createManualProvider();
}

export interface PaymentProviderStatus {
  key: PaymentProviderKey;
  /** `true` solo cuando hay credenciales y el adaptador puede cobrar de verdad. */
  supportsRecurring: boolean;
  configured: boolean;
  missing: string[];
}

/** Estado de la integración para el panel administrativo (sin secretos). */
export function describePaymentProvider(env: Env): PaymentProviderStatus {
  const provider = resolvePaymentProvider(env);
  const key: PaymentProviderKey = provider.key === 'lafise' ? 'lafise' : 'manual';
  return {
    key,
    supportsRecurring: provider.supportsRecurring,
    configured: key === 'manual' ? true : missingLafiseSettings(env).length === 0,
    missing: key === 'lafise' ? missingLafiseSettings(env) : [],
  };
}
