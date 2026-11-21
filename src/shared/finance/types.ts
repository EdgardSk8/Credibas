export type Currency = 'NIO' | 'USD';

export type PaymentFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export type AmortizationMethod = 'flat_interest' | 'fixed_installment' | 'declining_principal';

export type InterestType = 'flat' | 'declining';

export type InstallmentStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'restructured' | 'cancelled';

export type LoanStatus = 'draft' | 'active' | 'settled' | 'defaulted' | 'cancelled' | 'restructured';

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other';

export type RoleKey = 'owner' | 'admin' | 'supervisor' | 'collector' | 'viewer';

export interface ScheduleInput {
  principalCents: number;
  interestRateBps: number;
  installmentCount: number;
  method: AmortizationMethod;
  frequency: PaymentFrequency;
  customDays?: number | null;
  firstDueDate: string;
  /** Comisión total repartida entre cuotas. */
  feeCents?: number;
}

export interface ScheduledInstallment {
  number: number;
  dueDate: string;
  principalCents: number;
  interestCents: number;
  feeCents: number;
  totalCents: number;
  balanceCents: number;
}

export interface ScheduleResult {
  method: AmortizationMethod;
  annualizedRateBps: number;
  periodicRateBps: number;
  installments: ScheduledInstallment[];
  totalPrincipalCents: number;
  totalInterestCents: number;
  totalFeeCents: number;
  totalToPayCents: number;
}

export interface AllocationInput {
  amountCents: number;
  installments: Array<{
    id: string;
    dueDate: string;
    totalCents: number;
    principalCents: number;
    feeCents: number;
    paidPrincipalCents: number;
    paidInterestCents: number;
    paidFeeCents: number;
    paidLateFeeCents: number;
    lateFeeAccruedCents: number;
  }>;
  order?: AllocationOrder;
}

export type AllocationComponent = 'late_fee' | 'interest' | 'principal' | 'fee';

export type AllocationOrder = AllocationComponent[];

export interface AllocationLine {
  installmentId: string;
  lateFeeCents: number;
  interestCents: number;
  principalCents: number;
  feeCents: number;
}

export interface AllocationResult {
  lines: AllocationLine[];
  appliedCents: number;
  unappliedCents: number;
}
