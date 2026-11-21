import type { AllocationLine, AllocationOrder, AllocationResult, AllocationInput } from './types';

export const DEFAULT_ALLOCATION_ORDER: AllocationOrder = ['late_fee', 'interest', 'principal', 'fee'];

interface OpenInstallment {
  id: string;
  dueDate: string;
  lateFee: number;
  interest: number;
  principal: number;
  fee: number;
}

function byDueDate(a: { dueDate: string }, b: { dueDate: string }): number {
  return a.dueDate === b.dueDate ? 0 : a.dueDate < b.dueDate ? -1 : 1;
}

/**
 * Distribuye un pago entre las cuotas pendientes, empezando por la más antigua.
 * El orden de componentes es configurable por organización; por defecto
 * mora -> interés -> capital -> comisión.
 */
export function allocatePayment(input: AllocationInput): AllocationResult {
  const order = input.order?.length ? input.order : DEFAULT_ALLOCATION_ORDER;
  let remaining = Math.max(0, Math.trunc(input.amountCents));

  const open: OpenInstallment[] = input.installments
    .map((item) => ({
      id: item.id,
      dueDate: item.dueDate,
      lateFee: Math.max(0, item.lateFeeAccruedCents - item.paidLateFeeCents),
      interest: Math.max(0, item.totalCents - item.principalCents - item.feeCents - item.paidInterestCents),
      principal: Math.max(0, item.principalCents - item.paidPrincipalCents),
      fee: Math.max(0, item.feeCents - item.paidFeeCents),
    }))
    .sort(byDueDate);

  const lines: AllocationLine[] = [];

  for (const installment of open) {
    const line: AllocationLine = {
      installmentId: installment.id,
      lateFeeCents: 0,
      interestCents: 0,
      principalCents: 0,
      feeCents: 0,
    };
    let touched = false;

    for (const component of order) {
      if (remaining <= 0) break;
      if (component === 'late_fee') {
        const take = Math.min(remaining, installment.lateFee);
        installment.lateFee -= take;
        remaining -= take;
        line.lateFeeCents += take;
        touched ||= take > 0;
      } else if (component === 'interest') {
        const take = Math.min(remaining, installment.interest);
        installment.interest -= take;
        remaining -= take;
        line.interestCents += take;
        touched ||= take > 0;
      } else if (component === 'principal') {
        const take = Math.min(remaining, installment.principal);
        installment.principal -= take;
        remaining -= take;
        line.principalCents += take;
        touched ||= take > 0;
      } else {
        const take = Math.min(remaining, installment.fee);
        installment.fee -= take;
        remaining -= take;
        line.feeCents += take;
        touched ||= take > 0;
      }
    }

    if (touched) lines.push(line);
  }

  return {
    lines,
    appliedCents: Math.max(0, Math.trunc(input.amountCents)) - remaining,
    unappliedCents: remaining,
  };
}

/**
 * Abono directo a capital: reduce el capital pendiente de las cuotas más
 * antiguas sin tocar intereses ni mora. La reestructuración del calendario
 * es una decisión posterior y auditada.
 */
export function allocateExtraPrincipal(
  installments: Array<{ id: string; dueDate: string; principalCents: number; paidPrincipalCents: number; status: string }>,
  amountCents: number,
): { allocations: Array<{ installmentId: string; principalCents: number }>; appliedCents: number; unappliedCents: number } {
  let remaining = Math.max(0, Math.trunc(amountCents));
  const allocations: Array<{ installmentId: string; principalCents: number }> = [];

  const open = [...installments]
    .filter((item) => item.status !== 'paid' && item.status !== 'cancelled' && item.status !== 'restructured')
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  for (const installment of open) {
    if (remaining <= 0) break;
    const openPrincipal = Math.max(0, installment.principalCents - installment.paidPrincipalCents);
    const take = Math.min(remaining, openPrincipal);
    if (take > 0) {
      allocations.push({ installmentId: installment.id, principalCents: take });
      remaining -= take;
    }
  }

  return {
    allocations,
    appliedCents: Math.max(0, Math.trunc(amountCents)) - remaining,
    unappliedCents: remaining,
  };
}
