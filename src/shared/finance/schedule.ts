import Decimal from 'decimal.js';
import { addFrequency, periodsPerYear } from './dates';
import { divideCents } from './money';
import type { ScheduleInput, ScheduleResult, ScheduledInstallment } from './types';

export class FinanceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FinanceError';
    this.code = code;
  }
}

const MAX_INSTALLMENTS = 520;
const MAX_RATE_BPS = 10_000;

export function buildDueDates(input: ScheduleInput): string[] {
  const dates: string[] = [];
  let current = input.firstDueDate;
  for (let index = 0; index < input.installmentCount; index += 1) {
    dates.push(current);
    current = addFrequency(current, input.frequency, input.customDays);
  }
  return dates;
}

/**
 * Genera un calendario de amortización verificable.
 *
 * Reglas de redondeo:
 * - Todo importe se calcula en centavos y se redondea HALF_UP una sola vez.
 * - La suma de capital de las cuotas siempre es exactamente el capital
 *   solicitado; cualquier residuo de centavos se ajusta en la última cuota.
 * - En cuota fija el pago teórico se redondea a centavos y la última cuota
 *   liquida el saldo restante (puede diferir por centavos).
 */
export function generateSchedule(input: ScheduleInput): ScheduleResult {
  validateScheduleInput(input);

  const dueDates = buildDueDates(input);
  const periodicRate = new Decimal(input.interestRateBps).div(10_000);
  const feeCents = input.feeCents ?? 0;
  const feeParts = divideCents(feeCents, input.installmentCount);

  let rows: Array<{ principalCents: number; interestCents: number; balanceCents: number }>;

  if (input.method === 'flat_interest') {
    rows = buildFlatInterest(input, periodicRate);
  } else if (input.method === 'fixed_installment') {
    rows = buildFixedInstallment(input, periodicRate);
  } else {
    rows = buildDecliningPrincipal(input, periodicRate);
  }

  const installments: ScheduledInstallment[] = rows.map((row, index) => {
    const fee = feeParts[index] ?? 0;
    return {
      number: index + 1,
      dueDate: dueDates[index] as string,
      principalCents: row.principalCents,
      interestCents: row.interestCents,
      feeCents: fee,
      totalCents: row.principalCents + row.interestCents + fee,
      balanceCents: row.balanceCents,
    };
  });

  const totalPrincipalCents = installments.reduce((total, item) => total + item.principalCents, 0);
  const totalInterestCents = installments.reduce((total, item) => total + item.interestCents, 0);
  const totalFeeCents = installments.reduce((total, item) => total + item.feeCents, 0);

  return {
    method: input.method,
    annualizedRateBps: Math.round(Number(periodicRate.times(periodsPerYear(input.frequency, input.customDays)).times(10_000))),
    periodicRateBps: input.interestRateBps,
    installments,
    totalPrincipalCents,
    totalInterestCents,
    totalFeeCents,
    totalToPayCents: totalPrincipalCents + totalInterestCents + totalFeeCents,
  };
}

function validateScheduleInput(input: ScheduleInput): void {
  if (!Number.isInteger(input.principalCents) || input.principalCents <= 0) {
    throw new FinanceError('invalid_principal', 'El capital debe ser un entero positivo en centavos');
  }
  if (!Number.isInteger(input.installmentCount) || input.installmentCount <= 0 || input.installmentCount > MAX_INSTALLMENTS) {
    throw new FinanceError('invalid_installments', `El número de cuotas debe estar entre 1 y ${MAX_INSTALLMENTS}`);
  }
  if (!Number.isInteger(input.interestRateBps) || input.interestRateBps < 0 || input.interestRateBps > MAX_RATE_BPS) {
    throw new FinanceError('invalid_rate', `La tasa por período debe estar entre 0% y ${MAX_RATE_BPS / 100}%`);
  }
  if (input.feeCents !== undefined && (!Number.isInteger(input.feeCents) || input.feeCents < 0)) {
    throw new FinanceError('invalid_fee', 'La comisión debe ser un entero positivo en centavos');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstDueDate)) {
    throw new FinanceError('invalid_date', 'La primera fecha de vencimiento debe tener formato YYYY-MM-DD');
  }
}

function buildFlatInterest(input: ScheduleInput, periodicRate: Decimal) {
  const principalParts = divideCents(input.principalCents, input.installmentCount);
  const totalInterest = new Decimal(input.principalCents)
    .times(periodicRate)
    .times(input.installmentCount)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const interestParts = divideCents(totalInterest, input.installmentCount);

  let balance = input.principalCents;
  return principalParts.map((principalCents, index) => {
    balance -= principalCents;
    return { principalCents, interestCents: interestParts[index] ?? 0, balanceCents: balance };
  });
}

function buildFixedInstallment(input: ScheduleInput, periodicRate: Decimal) {
  if (periodicRate.isZero()) {
    return buildDecliningPrincipal(input, periodicRate);
  }

  const n = input.installmentCount;
  const payment = new Decimal(input.principalCents)
    .times(periodicRate)
    .div(new Decimal(1).minus(periodicRate.plus(1).pow(-n)))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

  const rows: Array<{ principalCents: number; interestCents: number; balanceCents: number }> = [];
  let balance = input.principalCents;

  for (let index = 0; index < n; index += 1) {
    const interestCents = new Decimal(balance).times(periodicRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    const isLast = index === n - 1;
    let principalCents = payment - interestCents;

    if (principalCents <= 0) {
      throw new FinanceError(
        'negative_amortization',
        'La cuota calculada no cubre los intereses del período. Ajusta la tasa, el plazo o usa otro método de amortización.',
      );
    }
    if (isLast || principalCents > balance) {
      principalCents = balance;
    }

    balance -= principalCents;
    rows.push({ principalCents, interestCents, balanceCents: balance });
  }

  return rows;
}

function buildDecliningPrincipal(input: ScheduleInput, periodicRate: Decimal) {
  const principalParts = divideCents(input.principalCents, input.installmentCount);
  let balance = input.principalCents;

  return principalParts.map((principalCents) => {
    const interestCents = new Decimal(balance).times(periodicRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    balance -= principalCents;
    return { principalCents, interestCents, balanceCents: balance };
  });
}
