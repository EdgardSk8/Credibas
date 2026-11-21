import Decimal from 'decimal.js';
import type { Currency } from './types';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -12, toExpPos: 40 });

export const CURRENCIES = ['NIO', 'USD'] as const;

export interface CurrencyMeta {
  code: Currency;
  name: string;
  symbol: string;
  locale: string;
}

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  NIO: { code: 'NIO', name: 'Córdoba nicaragüense', symbol: 'C$', locale: 'es-NI' },
  USD: { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', locale: 'en-US' },
};

/**
 * Los importes se persisten y transportan siempre como enteros en la unidad
 * menor de la moneda (centavos) para evitar errores de coma flotante.
 */
export function parseMoneyToCents(input: string | number, currency: Currency = 'NIO'): number {
  const raw = String(input).trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (raw === '' || raw === '-' || raw === '.' || raw === ',') return 0;

  let normalized = raw;
  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');

  if (hasDot && hasComma) {
    normalized = raw.replace(/,/g, '');
  } else if (hasComma) {
    normalized = /,\d{1,2}$/.test(raw) ? raw.replace(/,/g, '.') : raw.replace(/,/g, '');
  }

  const decimals = CURRENCY_META[currency]?.code ? 2 : 2;
  const value = new Decimal(normalized || '0');
  return value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).times(100).toNumber();
}

export function centsToDecimalString(cents: number): string {
  return new Decimal(cents).div(100).toFixed(2);
}

export function formatMoney(
  cents: number,
  currency: Currency = 'NIO',
  options: { compact?: boolean; withSymbol?: boolean } = {},
): string {
  const meta = CURRENCY_META[currency];
  const formatter = new Intl.NumberFormat('es-NI', {
    style: options.withSymbol === false ? 'decimal' : 'currency',
    currency: meta.code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    notation: options.compact ? 'compact' : 'standard',
  });
  return formatter.format(cents / 100);
}

export function formatMoneyCompact(cents: number, currency: Currency = 'NIO'): string {
  return formatMoney(cents, currency, { compact: true });
}

/** Aplica un porcentaje en puntos base a un importe en centavos. */
export function applyBps(cents: number, bps: number): number {
  return new Decimal(cents).times(bps).div(10_000).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function bpsToPercent(bps: number): string {
  return new Decimal(bps).div(100).toFixed(2);
}

export function percentToBps(percent: string | number): number {
  return new Decimal(percent).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export function divideCents(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}
