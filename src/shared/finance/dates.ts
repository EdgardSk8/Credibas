import type { PaymentFrequency } from './types';

const DAY_MS = 86_400_000;

export function parseDateOnly(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Fecha inválida: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error(`Fecha inválida: ${value}`);
  }
  return { year, month, day };
}

export function toDateOnly(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayInTimezone(timezone = 'America/Managua'): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function addDays(dateOnly: string, days: number): string {
  const { year, month, day } = parseDateOnly(dateOnly);
  const next = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return toDateOnly(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function addMonths(dateOnly: string, months: number): string {
  const { year, month, day } = parseDateOnly(dateOnly);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonthIndex = ((targetIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  return toDateOnly(targetYear, targetMonthIndex + 1, Math.min(day, lastDay));
}

export function addFrequency(dateOnly: string, frequency: string, customDays?: number | null): string {
  switch (frequency) {
    case 'daily':
      return addDays(dateOnly, 1);
    case 'weekly':
      return addDays(dateOnly, 7);
    case 'biweekly':
      return addDays(dateOnly, 14);
    case 'monthly':
      return addMonths(dateOnly, 1);
    case 'custom': {
      const days = Number(customDays);
      if (!Number.isInteger(days) || days <= 0) throw new Error('Los días personalizados deben ser un entero mayor a cero');
      return addDays(dateOnly, days);
    }
    default:
      throw new Error(`Frecuencia no soportada: ${frequency}`);
  }
}

export function diffDays(from: string, to: string): number {
  const a = parseDateOnly(from);
  const b = parseDateOnly(to);
  const start = Date.UTC(a.year, a.month - 1, a.day);
  const end = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((end - start) / DAY_MS);
}

export function compareDateOnly(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Cuotas por año según la frecuencia, usado para anualizar tasas por período. */
export function periodsPerYear(frequency: PaymentFrequency, customDays?: number | null): number {
  switch (frequency) {
    case 'daily':
      return 365;
    case 'weekly':
      return 52;
    case 'biweekly':
      return 26;
    case 'monthly':
      return 12;
    case 'custom': {
      const days = Number(customDays);
      return Number.isInteger(days) && days > 0 ? 365 / days : 12;
    }
    default:
      return 12;
  }
}
