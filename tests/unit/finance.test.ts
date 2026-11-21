import { describe, expect, it } from 'vitest';
import { generateSchedule, FinanceError } from '../../src/shared/finance/schedule';
import { calculateLateFeeCents } from '../../src/shared/finance/late-fees';
import { allocatePayment, allocateExtraPrincipal } from '../../src/shared/finance/allocation';
import { addDays, addMonths, diffDays } from '../../src/shared/finance/dates';
import { divideCents, parseMoneyToCents, percentToBps } from '../../src/shared/finance/money';

describe('fechas de negocio', () => {
  it('suma meses respetando el fin de mes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('suma días con exactitud', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(diffDays('2026-01-01', '2026-01-31')).toBe(30);
  });
});

describe('utilidades monetarias', () => {
  it('interpreta separadores decimales y de miles', () => {
    expect(parseMoneyToCents('1,234.56')).toBe(123456);
    expect(parseMoneyToCents('1,234')).toBe(123400);
    expect(parseMoneyToCents('12,34')).toBe(1234);
    expect(parseMoneyToCents('C$ 50,000.00')).toBe(5000000);
  });

  it('reparte residuos de centavos', () => {
    expect(divideCents(1000, 3)).toEqual([334, 333, 333]);
    expect(divideCents(10, 4).reduce((total, value) => total + value, 0)).toBe(10);
  });

  it('convierte porcentajes a puntos base', () => {
    expect(percentToBps('5.00')).toBe(500);
    expect(percentToBps('1.25')).toBe(125);
  });
});

describe('calendario de amortización', () => {
  it('interés plano: capital exacto y cuotas constantes', () => {
    const result = generateSchedule({
      principalCents: 1_000_000,
      interestRateBps: 500,
      installmentCount: 10,
      method: 'flat_interest',
      frequency: 'monthly',
      firstDueDate: '2026-12-01',
    });

    expect(result.installments).toHaveLength(10);
    expect(result.totalPrincipalCents).toBe(1_000_000);
    expect(result.totalInterestCents).toBe(500_000);
    expect(result.totalToPayCents).toBe(1_500_000);
    expect(new Set(result.installments.map((item) => item.totalCents)).size).toBe(1);
    expect(result.installments.at(-1)?.balanceCents).toBe(0);
  });

  it('cuota fija: la última cuota liquida el saldo exacto', () => {
    const result = generateSchedule({
      principalCents: 5_000_000,
      interestRateBps: 450,
      installmentCount: 12,
      method: 'fixed_installment',
      frequency: 'monthly',
      firstDueDate: '2026-12-15',
    });

    expect(result.totalPrincipalCents).toBe(5_000_000);
    expect(result.installments.at(-1)?.balanceCents).toBe(0);
    expect(result.installments.every((item, index) => index === 0 || item.interestCents <= (result.installments[index - 1]?.interestCents ?? 0))).toBe(true);
    expect(result.installments.at(-1)?.principalCents).toBeGreaterThan(0);
  });

  it('saldo insoluto: capital constante e interés decreciente', () => {
    const result = generateSchedule({
      principalCents: 1_200_000,
      interestRateBps: 1000,
      installmentCount: 6,
      method: 'declining_principal',
      frequency: 'biweekly',
      firstDueDate: '2026-12-01',
    });

    const principals = new Set(result.installments.map((item) => item.principalCents));
    expect(principals.size).toBe(1);
    expect(result.totalPrincipalCents).toBe(1_200_000);
    expect(result.installments[0]?.interestCents).toBeGreaterThan(result.installments.at(-1)?.interestCents ?? 0);
  });

  it('rechaza capital inválido y tasas fuera de rango', () => {
    expect(() =>
      generateSchedule({
        principalCents: 0,
        interestRateBps: 500,
        installmentCount: 1,
        method: 'flat_interest',
        frequency: 'monthly',
        firstDueDate: '2026-12-01',
      }),
    ).toThrow(FinanceError);

    expect(() =>
      generateSchedule({
        principalCents: 1000,
        interestRateBps: 20_000,
        installmentCount: 1,
        method: 'flat_interest',
        frequency: 'monthly',
        firstDueDate: '2026-12-01',
      }),
    ).toThrow(FinanceError);
  });

  it('rechaza cuota fija que no cubre intereses', () => {
    expect(() =>
      generateSchedule({
        principalCents: 1000,
        interestRateBps: 10_000,
        installmentCount: 60,
        method: 'fixed_installment',
        frequency: 'monthly',
        firstDueDate: '2026-12-01',
      }),
    ).toThrow(/no cubre los intereses/);
  });
});

describe('mora', () => {
  it('calcula mora simple sobre saldo vencido con período de gracia', () => {
    const fee = calculateLateFeeCents({
      totalCents: 100_000,
      paidCents: 40_000,
      dueDate: '2026-11-01',
      asOfDate: '2026-11-11',
      dailyBps: 50,
      graceDays: 2,
    });

    // 60,000 * 0.5% * 8 días = 2,400
    expect(fee).toBe(2400);
  });

  it('no cobra mora dentro del período de gracia', () => {
    const fee = calculateLateFeeCents({
      totalCents: 100_000,
      paidCents: 0,
      dueDate: '2026-11-10',
      asOfDate: '2026-11-11',
      dailyBps: 50,
      graceDays: 3,
    });
    expect(fee).toBe(0);
  });
});

describe('distribución de pagos', () => {
  const installment = {
    id: 'i1',
    dueDate: '2026-11-01',
    totalCents: 100_000,
    principalCents: 90_000,
    feeCents: 0,
    paidPrincipalCents: 0,
    paidInterestCents: 0,
    paidFeeCents: 0,
    paidLateFeeCents: 0,
    lateFeeAccruedCents: 2000,
  };

  it('aplica mora, interés y capital en orden', () => {
    const result = allocatePayment({ amountCents: 50_000, installments: [installment] });
    expect(result.unappliedCents).toBe(0);
    expect(result.lines[0]?.lateFeeCents).toBe(2_000);
    expect(result.lines[0]?.interestCents).toBe(10_000);
    expect(result.lines[0]?.principalCents).toBe(38_000);
  });

  it('respeta un orden configurable', () => {
    const result = allocatePayment({
      amountCents: 50_000,
      installments: [installment],
      order: ['principal', 'interest', 'fee', 'late_fee'],
    });
    expect(result.lines[0]?.principalCents).toBe(50_000);
    expect(result.lines[0]?.lateFeeCents).toBe(0);
  });

  it('devuelve el remanente cuando el pago excede la deuda', () => {
    const result = allocatePayment({ amountCents: 200_000, installments: [installment] });
    expect(result.appliedCents).toBe(102_000);
    expect(result.unappliedCents).toBe(98_000);
  });

  it('no toca cuotas ya pagadas y avanza a la siguiente', () => {
    const paid = { ...installment, id: 'i0', paidPrincipalCents: 90_000, paidInterestCents: 10_000, paidLateFeeCents: 2_000 };
    const next = { ...installment, id: 'i2', dueDate: '2026-12-01', lateFeeAccruedCents: 0 };
    const result = allocatePayment({ amountCents: 10_000, installments: [paid, next] });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.installmentId).toBe('i2');
  });

  it('abono a capital solo reduce principal', () => {
    const result = allocateExtraPrincipal(
      [{ id: 'i1', dueDate: '2026-11-01', principalCents: 90_000, paidPrincipalCents: 0, status: 'pending' }],
      30_000,
    );
    expect(result.appliedCents).toBe(30_000);
    expect(result.allocations[0]?.principalCents).toBe(30_000);
  });
});
