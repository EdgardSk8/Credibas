import { addMonths } from '@shared/finance/dates';
import { parseMoneyToCents } from '@shared/finance/money';
import { generateSchedule, FinanceError } from '@shared/finance/schedule';
import type { ScheduleResult } from '@shared/finance/types';
import type { Currency } from '@shared/finance/types';
import { todayDateOnly } from '../../lib/format';

export type LoanMethod = 'flat_interest' | 'fixed_installment' | 'declining_principal';
export type LoanFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export interface LoanFormValues {
  principal: string;
  ratePercent: string;
  method: LoanMethod;
  installmentCount: number;
  frequency: LoanFrequency;
  customDays: number;
  disbursementDate: string;
  firstDueDate: string;
  fee: string;
  lateFeeDailyBps: number;
  graceDays: number;
  notes: string;
}

export function defaultLoanForm(currency: Currency): LoanFormValues {
  void currency;
  const today = todayDateOnly();
  return {
    principal: '',
    ratePercent: '5.00',
    method: 'fixed_installment',
    installmentCount: 12,
    frequency: 'monthly',
    customDays: 15,
    disbursementDate: today,
    firstDueDate: addMonths(today, 1),
    fee: '0',
    lateFeeDailyBps: 50,
    graceDays: 0,
    notes: '',
  };
}

export interface PreviewOutcome {
  schedule: ScheduleResult | null;
  error: string | null;
}

export function previewLoan(values: LoanFormValues): PreviewOutcome {
  const principalCents = parseMoneyToCents(values.principal || '0');
  const rate = Number.parseFloat(values.ratePercent.replace(',', '.'));

  if (!Number.isFinite(principalCents) || principalCents <= 0) {
    return { schedule: null, error: 'Ingresa un capital mayor a cero.' };
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return { schedule: null, error: 'Ingresa una tasa válida.' };
  }

  try {
    const schedule = generateSchedule({
      principalCents,
      interestRateBps: Math.round(rate * 100),
      installmentCount: values.installmentCount,
      method: values.method,
      frequency: values.frequency,
      customDays: values.frequency === 'custom' ? values.customDays : null,
      firstDueDate: values.firstDueDate,
      feeCents: parseMoneyToCents(values.fee || '0'),
    });
    return { schedule, error: null };
  } catch (error) {
    if (error instanceof FinanceError) return { schedule: null, error: error.message };
    return { schedule: null, error: 'No pudimos calcular el calendario. Revisa los datos.' };
  }
}

export function buildLoanPayload(values: LoanFormValues, clientId: string, currency: Currency) {
  return {
    clientId,
    currency,
    principalCents: parseMoneyToCents(values.principal),
    interestRateBps: Math.round(Number.parseFloat(values.ratePercent.replace(',', '.')) * 100),
    amortizationMethod: values.method,
    installmentCount: values.installmentCount,
    frequency: values.frequency,
    customDays: values.frequency === 'custom' ? values.customDays : null,
    disbursementDate: values.disbursementDate,
    firstDueDate: values.firstDueDate,
    feeCents: parseMoneyToCents(values.fee || '0'),
    lateFeeDailyBps: values.lateFeeDailyBps,
    graceDays: values.graceDays,
    notes: values.notes.trim() || null,
  };
}
