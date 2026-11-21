import { toIso } from '../lib/crypto';
import type {
  CashMovementSummary,
  CashRegisterSummary,
  ClientSummary,
  InstallmentSummary,
  LoanSummary,
  PaymentSummary,
  PlanSummary,
  UsageSummary,
} from '../../shared/types';
import type { ClientRow } from '../repositories/clients';
import type { InstallmentRow, LoanListRow } from '../repositories/loans';
import type { PaymentListRow, PaymentAllocationRow } from '../repositories/payments';
import type { RegisterSummaryRow, CashMovementRow } from '../repositories/cash';
import type { PlanRow, SubscriptionWithPlan } from '../repositories/subscriptions';
import { LIMIT_LABELS } from '../services/limits';

export function mapClient(row: ClientRow): ClientSummary {
  let references: ClientSummary['references'] = [];
  try {
    references = JSON.parse(row.references_json) as ClientSummary['references'];
  } catch {
    references = [];
  }

  return {
    id: row.id,
    code: row.code,
    fullName: row.full_name,
    identification: row.identification,
    phone: row.phone,
    email: row.email,
    address: row.address,
    status: row.status,
    notes: row.notes,
    references,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function mapInstallment(row: InstallmentRow): InstallmentSummary {
  const outstanding =
    Math.max(0, row.principal_cents - row.paid_principal_cents) +
    Math.max(0, row.interest_cents - row.paid_interest_cents) +
    Math.max(0, row.fee_cents - row.paid_fee_cents);

  return {
    id: row.id,
    number: row.number,
    dueDate: row.due_date,
    principalCents: row.principal_cents,
    interestCents: row.interest_cents,
    feeCents: row.fee_cents,
    totalCents: row.total_cents,
    paidPrincipalCents: row.paid_principal_cents,
    paidInterestCents: row.paid_interest_cents,
    paidFeeCents: row.paid_fee_cents,
    paidLateFeeCents: row.paid_late_fee_cents,
    lateFeeAccruedCents: row.late_fee_accrued_cents,
    status: row.status,
    paidAt: toIso(row.paid_at),
    outstandingCents: outstanding,
  };
}

export function mapLoan(row: LoanListRow): LoanSummary {
  const paid = Number(row.paid_cents ?? 0);
  const outstanding = Number(row.outstanding_cents ?? 0);
  const total = row.total_to_pay_cents || 1;

  return {
    id: row.id,
    code: row.code,
    clientId: row.client_id,
    clientName: row.client_name,
    currency: row.currency,
    principalCents: row.principal_cents,
    interestRateBps: row.interest_rate_bps,
    interestType: row.interest_type,
    amortizationMethod: row.amortization_method,
    installmentCount: row.installment_count,
    frequency: row.frequency,
    customDays: row.custom_days,
    disbursementDate: row.disbursement_date,
    firstDueDate: row.first_due_date,
    totalInterestCents: row.total_interest_cents,
    totalFeeCents: row.total_fee_cents,
    totalToPayCents: row.total_to_pay_cents,
    lateFeeDailyBps: row.late_fee_daily_bps,
    graceDays: row.grace_days,
    status: row.status,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    metrics: {
      paidCents: paid,
      outstandingCents: outstanding,
      overdueCents: Number(row.overdue_cents ?? 0),
      overdueCount: Number(row.overdue_count ?? 0),
      nextDueDate: row.next_due_date ?? null,
      progressPercent: Math.min(100, Math.round((paid / total) * 1000) / 10),
    },
  };
}

export function mapPayment(row: PaymentListRow, allocations: PaymentAllocationRow[] = []): PaymentSummary {
  return {
    id: row.id,
    loanId: row.loan_id,
    loanCode: row.loan_code,
    clientId: row.client_id,
    clientName: row.client_name,
    amountCents: row.amount_cents,
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    paidAt: row.paid_at,
    status: row.status,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    createdByName: row.created_by_name,
    allocations: allocations.map((allocation) => ({
      installmentId: allocation.installment_id,
      installmentNumber: 0,
      principalCents: allocation.principal_cents,
      interestCents: allocation.interest_cents,
      feeCents: allocation.fee_cents,
      lateFeeCents: allocation.late_fee_cents,
    })),
  };
}

export function mapRegister(row: RegisterSummaryRow): CashRegisterSummary {
  return {
    id: row.id,
    status: row.status,
    openedAt: new Date(row.opened_at).toISOString(),
    openedByName: row.opened_by_name,
    closedAt: toIso(row.closed_at),
    closedByName: row.closed_by_name,
    openingBalanceCents: row.opening_balance_cents,
    expectedBalanceCents: row.expected_balance_cents,
    countedBalanceCents: row.counted_balance_cents,
    differenceCents: row.difference_cents,
    incomeCents: Number(row.income_cents ?? 0),
    expenseCents: Number(row.expense_cents ?? 0),
    balanceCents: Number(row.balance_cents ?? 0),
    notes: row.notes,
  };
}

export function mapMovement(row: CashMovementRow & { created_by_name: string | null }): CashMovementSummary {
  return {
    id: row.id,
    direction: row.direction,
    category: row.category,
    amountCents: row.amount_cents,
    currency: row.currency,
    sourceType: row.source_type,
    sourceId: row.source_id,
    description: row.description,
    createdAt: new Date(row.created_at).toISOString(),
    createdByName: row.created_by_name,
  };
}

export function mapPlan(row: PlanRow, limits: Record<string, number> = {}): PlanSummary {
  let features: string[] = [];
  try {
    features = JSON.parse(row.features_json) as string[];
  } catch {
    features = [];
  }

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    priceMonthlyCents: row.price_monthly_cents,
    priceYearlyCents: row.price_yearly_cents,
    currency: row.currency,
    trialDays: row.trial_days,
    isActive: row.is_active === 1,
    isPublic: row.is_public === 1,
    sortOrder: row.sort_order,
    features,
    limits,
  };
}

export function buildUsageRows(limits: Record<string, number>, usage: Record<string, number>): UsageSummary[] {
  return Object.keys(limits)
    .filter((key) => key in LIMIT_LABELS)
    .map((key) => {
      const limit = limits[key] ?? 0;
      const used = usage[key] ?? 0;
      return {
        metric: key,
        label: LIMIT_LABELS[key] ?? key,
        used,
        limit,
        percent: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
      };
    });
}

export function mapSubscription(
  subscription: SubscriptionWithPlan,
  limits: Record<string, number>,
  usage: Record<string, number>,
) {
  return {
    id: subscription.id,
    orgId: subscription.org_id,
    plan: mapPlan(subscription.plan, limits),
    status: subscription.status,
    billingCycle: subscription.billing_cycle,
    trialEndsAt: toIso(subscription.trial_ends_at),
    currentPeriodStart: new Date(subscription.current_period_start).toISOString(),
    currentPeriodEnd: new Date(subscription.current_period_end).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === 1,
    usage: buildUsageRows(limits, usage),
    limits,
  };
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
  return `\uFEFF${lines.join('\r\n')}`;
}
