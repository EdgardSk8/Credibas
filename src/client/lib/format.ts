import { CURRENCY_META, formatMoney as formatMoneyShared } from '@shared/finance/money';
import { diffDays } from '@shared/finance/dates';
import type { Currency } from '@shared/finance/types';

export function money(cents: number, currency: Currency = 'NIO'): string {
  return formatMoneyShared(cents, currency);
}

export function moneyCompact(cents: number, currency: Currency = 'NIO'): string {
  return formatMoneyShared(cents, currency, { compact: true });
}

export function currencySymbol(currency: Currency): string {
  return CURRENCY_META[currency].symbol;
}

export function percentFromBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function dateLong(iso: string | null | undefined, timezone = 'America/Managua'): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeZone: timezone }).format(date);
}

export function dateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function dateTime(iso: string | null | undefined, timezone = 'America/Managua'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(iso));
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return dateShort(iso);
}

export function todayDateOnly(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/** Días de calendario que faltan para una fecha (negativo si ya pasó). */
export function daysUntil(value: string | null | undefined, timezone = 'America/Managua'): number | null {
  if (!value) return null;

  let endDate = value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    endDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
  }

  return diffDays(todayDateOnly(), endDate);
}

export function firstDayOfMonth(dateOnly = todayDateOnly()): string {
  return `${dateOnly.slice(0, 7)}-01`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
