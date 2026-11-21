import type { Currency } from './finance/types';
import type { Permission, RoleKey } from './rbac';

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  createdAt: string;
}

export interface MembershipSummary {
  orgId: string;
  memberId: string;
  orgName: string;
  orgSlug: string;
  currency: Currency;
  timezone: string;
  role: RoleKey;
  roleName: string;
  permissions: Permission[];
  subscriptionStatus: string;
}

export interface MeResponse {
  user: SessionUser;
  memberships: MembershipSummary[];
  activeOrgId: string | null;
  onboardingComplete: boolean;
}

export interface PlanSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  currency: string;
  trialDays: number;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  features: string[];
  limits: Record<string, number>;
}

export interface SubscriptionSummary {
  id: string;
  orgId: string;
  plan: PlanSummary;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  billingCycle: 'monthly' | 'yearly';
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  usage: UsageSummary[];
  limits: Record<string, number>;
}

export interface UsageSummary {
  metric: string;
  label: string;
  used: number;
  limit: number;
  percent: number;
}

export interface ClientReference {
  name: string;
  phone?: string;
  relationship?: string;
  address?: string;
}

export interface ClientSummary {
  id: string;
  code: string;
  fullName: string;
  identification: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: 'active' | 'inactive' | 'blocked';
  notes: string | null;
  references: ClientReference[];
  createdAt: string;
  updatedAt: string;
  stats?: ClientStats;
}

export interface ClientStats {
  activeLoans: number;
  outstandingCents: number;
  overdueCents: number;
  totalPaidCents: number;
  lastPaymentAt: string | null;
}

export interface InstallmentSummary {
  id: string;
  number: number;
  dueDate: string;
  principalCents: number;
  interestCents: number;
  feeCents: number;
  totalCents: number;
  paidPrincipalCents: number;
  paidInterestCents: number;
  paidFeeCents: number;
  paidLateFeeCents: number;
  lateFeeAccruedCents: number;
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'restructured' | 'cancelled';
  paidAt: string | null;
  outstandingCents: number;
}

export interface LoanSummary {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  currency: Currency;
  principalCents: number;
  interestRateBps: number;
  interestType: 'flat' | 'declining';
  amortizationMethod: 'flat_interest' | 'fixed_installment' | 'declining_principal';
  installmentCount: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
  customDays: number | null;
  disbursementDate: string;
  firstDueDate: string;
  totalInterestCents: number;
  totalFeeCents: number;
  totalToPayCents: number;
  lateFeeDailyBps: number;
  graceDays: number;
  status: 'draft' | 'active' | 'settled' | 'defaulted' | 'cancelled' | 'restructured';
  notes: string | null;
  createdAt: string;
  metrics: LoanMetrics;
}

export interface LoanMetrics {
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
  overdueCount: number;
  nextDueDate: string | null;
  progressPercent: number;
}

export interface PaymentSummary {
  id: string;
  loanId: string;
  loanCode: string;
  clientId: string;
  clientName: string;
  amountCents: number;
  currency: Currency;
  method: 'cash' | 'transfer' | 'card' | 'other';
  reference: string | null;
  paidAt: string;
  status: 'confirmed' | 'reversed';
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  allocations: Array<{
    installmentId: string;
    installmentNumber: number;
    principalCents: number;
    interestCents: number;
    feeCents: number;
    lateFeeCents: number;
  }>;
}

export interface DashboardMetrics {
  period: { from: string; to: string };
  currency: Currency;
  totals: {
    capitalDisbursedCents: number;
    capitalRecoveredCents: number;
    portfolioOutstandingCents: number;
    overdueAmountCents: number;
    overdueInstallments: number;
    activeLoans: number;
    settledLoans: number;
    clients: number;
    expectedTodayCents: number;
    collectedTodayCents: number;
  };
  upcoming: Array<{
    installmentId: string;
    loanId: string;
    loanCode: string;
    clientName: string;
    dueDate: string;
    totalCents: number;
    overdue: boolean;
  }>;
  monthly: Array<{ month: string; disbursedCents: number; collectedCents: number }>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    amountCents: number | null;
    createdAt: string;
    actorName: string | null;
  }>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CashRegisterSummary {
  id: string;
  status: 'open' | 'closed';
  openedAt: string;
  openedByName: string;
  closedAt: string | null;
  closedByName: string | null;
  openingBalanceCents: number;
  expectedBalanceCents: number | null;
  countedBalanceCents: number | null;
  differenceCents: number | null;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  notes: string | null;
}

export interface CashMovementSummary {
  id: string;
  direction: 'in' | 'out';
  category: string;
  amountCents: number;
  currency: Currency;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface CollectionAssignmentSummary {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  loanId: string | null;
  loanCode: string | null;
  collectorMemberId: string;
  collectorName: string;
  status: 'active' | 'paused' | 'closed';
  nextContactAt: string | null;
  overdueCents: number;
  overdueCount: number;
  oldestDueDate: string | null;
}

export interface CollectionActivitySummary {
  id: string;
  clientId: string;
  clientName: string;
  loanId: string | null;
  type: 'call' | 'visit' | 'message' | 'promise' | 'note';
  outcome: string | null;
  notes: string | null;
  promiseAmountCents: number | null;
  promiseDate: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: string;
  metadata?: unknown;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  currency: Currency;
  timezone: string;
  dateFormat: string;
  status: 'active' | 'suspended' | 'closed';
  createdAt: string;
  subscriptionStatus: string;
  planKey: string;
}

export interface AdminOrganizationSummary extends OrganizationSummary {
  ownerName: string;
  ownerEmail: string;
  membersCount: number;
  clientsCount: number;
  activeLoansCount: number;
  portfolioOutstandingCents: number;
  trialEndsAt: string | null;
}

export interface AdminOverview {
  organizations: number;
  activeSubscriptions: number;
  trialing: number;
  canceledLast30Days: number;
  mrrCents: number;
  arrCents: number;
  users: number;
  clients: number;
  activeLoans: number;
  portfolioOutstandingCents: number;
}
