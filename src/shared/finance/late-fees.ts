import Decimal from 'decimal.js';
import { diffDays } from './dates';

export interface LateFeeInput {
  totalCents: number;
  paidCents: number;
  dueDate: string;
  asOfDate: string;
  dailyBps: number;
  graceDays: number;
}

/**
 * Mora simple: porcentaje diario sobre el saldo vencido, sin capitalizar.
 * Se cuenta desde el día siguiente al vencimiento (+ período de gracia).
 */
export function calculateLateFeeCents(input: LateFeeInput): number {
  if (input.dailyBps <= 0) return 0;

  const outstanding = Math.max(0, input.totalCents - input.paidCents);
  if (outstanding === 0) return 0;

  const overdueDays = diffDays(input.dueDate, input.asOfDate) - Math.max(0, input.graceDays);
  if (overdueDays <= 0) return 0;

  return new Decimal(outstanding)
    .times(input.dailyBps)
    .div(10_000)
    .times(overdueDays)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}
