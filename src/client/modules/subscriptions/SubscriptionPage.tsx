import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CreditCard, Gauge, Receipt } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { api, errorMessage } from '../../lib/api';
import { dateShort, daysUntil, money } from '../../lib/format';
import { subscriptionStatus } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';
import { PERMISSIONS } from '@shared/rbac';
import type { PlanSummary, SubscriptionRequestSummary, SubscriptionSummary, UsageSummary } from '@shared/types';

interface InvoiceItem {
  id: string;
  number: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  notes: string | null;
}

interface UpcomingCharge {
  nextChargeAt: string;
  graceEndsAt: string | null;
  status: string;
  billingCycle: 'monthly' | 'yearly';
  amountCents: number;
  currency: 'USD' | 'NIO';
  autoCharge: boolean;
  provider: string;
}

interface PaymentMethodItem {
  id: string;
  provider: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  holderName: string | null;
  status: string;
  isDefault: boolean;
  authorizedAt: string | null;
}

const TOLERANCE_DAYS = 3;

type DaysTone = 'ok' | 'soon' | 'late' | 'muted';

function billingDays(end: string): { tone: DaysTone; label: string; hint: string | null } {
  const days = daysUntil(end);
  if (days === null) return { tone: 'muted', label: '—', hint: null };

  const tone: DaysTone = days > 5 ? 'ok' : days > 1 ? 'soon' : 'late';
  const label =
    days > 1
      ? `${days} días`
      : days === 1
        ? '1 día'
        : days === 0
          ? 'Vence hoy'
          : `Vencido hace ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'}`;

  const toleranceLeft = Math.max(0, TOLERANCE_DAYS + days);
  const hint =
    days < 0
      ? toleranceLeft > 0
        ? `Tolerancia: ${toleranceLeft === 1 ? 'queda' : 'quedan'} ${toleranceLeft} de ${TOLERANCE_DAYS} días`
        : `Período de tolerancia finalizado (${TOLERANCE_DAYS} días)`
      : tone === 'late'
        ? `Incluye ${TOLERANCE_DAYS} días de tolerancia.`
        : null;

  return { tone, label, hint };
}

function UsageRow({ usage }: { usage: UsageSummary }) {
  const warning = usage.percent >= 85;
  return (
    <div className="usage-row">
      <div className="usage-label">
        <strong>{usage.label}</strong>
        <span>
          {usage.used} / {usage.limit < 0 ? '∞' : usage.limit}
        </span>
      </div>
      <div className={`progress ${warning ? 'progress-warning' : ''}`}>
        <span style={{ width: `${usage.percent}%` }} />
      </div>
    </div>
  );
}

export function SubscriptionPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [confirmPlan, setConfirmPlan] = useState<PlanSummary | null>(null);
  const [saving, setSaving] = useState(false);

  const subscriptionQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.get<{ subscription: SubscriptionSummary }>('/api/subscriptions/current'),
  });

  const plansQuery = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api.get<{ items: PlanSummary[] }>('/api/subscriptions/plans'),
  });

  const requestsQuery = useQuery({
    queryKey: ['subscription-requests'],
    queryFn: () =>
      api.get<{ freePlanUsed: boolean; pending: SubscriptionRequestSummary | null }>('/api/subscriptions/requests'),
  });

  const invoicesQuery = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<{ items: InvoiceItem[] }>('/api/subscriptions/invoices'),
  });

  const upcomingQuery = useQuery({
    queryKey: ['subscription-upcoming'],
    queryFn: () => api.get<UpcomingCharge>('/api/subscriptions/upcoming'),
  });

  const methodQuery = useQuery({
    queryKey: ['subscription-payment-method'],
    queryFn: () =>
      api.get<{ items: PaymentMethodItem[]; provider: string; autoChargeAvailable: boolean }>(
        '/api/subscriptions/payment-method',
      ),
  });

  const subscription = subscriptionQuery.data?.subscription;
  const plans = plansQuery.data?.items ?? [];
  const freePlan = plans.find((plan) => plan.priceMonthlyCents === 0 && plan.priceYearlyCents === 0) ?? null;
  const paidPlans = plans.filter((plan) => plan.priceMonthlyCents > 0 || plan.priceYearlyCents > 0);
  const pendingRequest = requestsQuery.data?.pending ?? null;
  const freePlanUsed = subscription?.freePlanUsed ?? requestsQuery.data?.freePlanUsed ?? false;

  const requestPlan = async () => {
    if (!confirmPlan) return;
    setSaving(true);
    try {
      await api.post('/api/subscriptions/request', { planKey: confirmPlan.key, billingCycle: cycle });
      toast.success('Solicitud enviada. El administrador verificará tu pago.');
      setConfirmPlan(null);
      await queryClient.invalidateQueries({ queryKey: ['subscription-requests'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const startFree = async () => {
    setSaving(true);
    try {
      await api.post('/api/subscriptions/start-free');
      toast.success('Plan gratuito activado.');
      await queryClient.invalidateQueries({ queryKey: ['subscription'] });
      await queryClient.invalidateQueries({ queryKey: ['subscription-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    setSaving(true);
    try {
      await api.post('/api/subscriptions/cancel');
      toast.success('La suscripción no se renovará al final del período.');
      await queryClient.invalidateQueries({ queryKey: ['subscription'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const resume = async () => {
    setSaving(true);
    try {
      await api.post('/api/subscriptions/resume');
      toast.success('Suscripción reactivada.');
      await queryClient.invalidateQueries({ queryKey: ['subscription'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const revokeMethod = async (id: string) => {
    setSaving(true);
    try {
      await api.delete(`/api/subscriptions/payment-method/${id}`);
      toast.success('Método de pago eliminado.');
      await queryClient.invalidateQueries({ queryKey: ['subscription-payment-method'] });
      await queryClient.invalidateQueries({ queryKey: ['subscription-upcoming'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (subscriptionQuery.isLoading) return <LoadingBlock label="Cargando suscripción…" />;
  if (subscriptionQuery.isError || !subscription) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(subscriptionQuery.error)}</span>
      </div>
    );
  }

  const billing = billingDays(subscription.currentPeriodEnd);

  return (
    <>
      <PageHeader
        icon={<CreditCard size={16} />}
        title="Suscripción"
        description="Tu plan, límites de uso y facturación."
        actions={
          <StatusBadge map={subscriptionStatus} value={subscription.status} />
        }
      />

      <div className="detail-grid">
        <div className="dashboard-stack">
          <section className="card">
            <div className="plan-summary">
              <div className="plan-summary-head">
                <div>
                  <span className="eyebrow">Plan actual</span>
                  <h2 style={{ fontSize: '1.7rem', marginTop: 4 }}>{subscription.plan.name}</h2>
                  <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {subscription.plan.description}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {money(
                      subscription.billingCycle === 'yearly'
                        ? subscription.plan.priceYearlyCents
                        : subscription.plan.priceMonthlyCents,
                      'USD',
                    )}
                  </div>
                  <span className="field-hint">por {subscription.billingCycle === 'yearly' ? 'año' : 'mes'}</span>
                </div>
              </div>

              <div className="detail-meta">
                <div className="meta-row">
                  <span>Período actual</span>
                  <strong>
                    {dateShort(subscription.currentPeriodStart)} — {dateShort(subscription.currentPeriodEnd)}
                  </strong>
                </div>
                <div className="meta-row">
                  <span>Días restantes</span>
                  <strong className={`days-left days-left--${billing.tone}`}>{billing.label}</strong>
                </div>
                {billing.hint && <p className="days-left-hint">{billing.hint}</p>}
                {subscription.trialEndsAt && (
                  <div className="meta-row">
                    <span>Prueba termina</span>
                    <strong>{dateShort(subscription.trialEndsAt)}</strong>
                  </div>
                )}
                {upcomingQuery.data && (
                  <div className="meta-row">
                    <span>Próximo cobro</span>
                    <strong>
                      {money(upcomingQuery.data.amountCents, upcomingQuery.data.currency)} ·{' '}
                      {dateShort(upcomingQuery.data.nextChargeAt)}
                    </strong>
                  </div>
                )}
                <div className="meta-row">
                  <span>Renovación automática</span>
                  <strong>{subscription.cancelAtPeriodEnd ? 'Cancelada al final del período' : 'Activa'}</strong>
                </div>
              </div>

              <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                {hasPermission(PERMISSIONS.billingManage) && (
                  <>
                    {subscription.cancelAtPeriodEnd ? (
                      <Button variant="secondary" onClick={resume} loading={saving}>
                        Reactivar renovación
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={cancel} loading={saving}>
                        Cancelar renovación
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <CreditCard size={13} />
                  </span>
                  Método de pago
                </div>
                <div className="card-subtitle">
                  {methodQuery.data?.autoChargeAvailable
                    ? 'Cobro automático con tarjeta habilitado por el banco.'
                    : 'Cobro automático con tarjeta no disponible todavía: pagas por transferencia y el administrador confirma el pago.'}
                </div>
              </div>
            </div>

            {(methodQuery.data?.items.length ?? 0) === 0 ? (
              <p className="field-hint">Sin tarjeta registrada.</p>
            ) : (
              <div className="dashboard-stack" style={{ gap: '0.5rem' }}>
                {methodQuery.data?.items.map((method) => (
                  <div key={method.id} className="meta-row">
                    <span>
                      {method.brand ? method.brand.toUpperCase() : 'Tarjeta'} ···· {method.last4 ?? '····'}
                      {method.expMonth && method.expYear
                        ? ` · vence ${String(method.expMonth).padStart(2, '0')}/${method.expYear}`
                        : ''}
                    </span>
                    <strong>
                      {method.status === 'active' ? 'Activa' : method.status === 'revoked' ? 'Revocada' : method.status}
                      {method.status === 'active' && hasPermission(PERMISSIONS.billingManage) && (
                        <Button variant="ghost" onClick={() => revokeMethod(method.id)} loading={saving}>
                          Quitar
                        </Button>
                      )}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <Gauge size={13} />
                  </span>
                  Uso del plan
                </div>
                <div className="card-subtitle">Los límites se validan en el backend antes de cada operación.</div>
              </div>
            </div>
            <div className="usage-grid">
              {subscription.usage.map((usage) => (
                <UsageRow key={usage.metric} usage={usage} />
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <Receipt size={13} />
                  </span>
                  Facturas
                </div>
              </div>
            </div>
            {(invoicesQuery.data?.items.length ?? 0) === 0 ? (
              <p className="field-hint">Aún no hay facturas generadas.</p>
            ) : (
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Emitida</th>
                      <th className="text-right">Monto</th>
                      <th>Estado</th>
                      <th>Pagada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesQuery.data?.items.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="mono" style={{ fontSize: 12 }}>{invoice.number}</td>
                        <td>{dateShort(invoice.issuedAt)}</td>
                        <td className="text-right numeric">{money(invoice.amountCents, invoice.currency as 'NIO' | 'USD')}</td>
                        <td>{invoice.status}</td>
                        <td>{invoice.paidAt ? dateShort(invoice.paidAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="dashboard-stack">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <ArrowUpRight size={13} />
                  </span>
                  Solicitar cambio de plan
                </div>
                <div className="card-subtitle">El administrador activa el plan cuando confirme tu pago.</div>
              </div>
            </div>

            <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
              <button type="button" className="tab" aria-selected={cycle === 'monthly'} onClick={() => setCycle('monthly')}>
                Mensual
              </button>
              <button type="button" className="tab" aria-selected={cycle === 'yearly'} onClick={() => setCycle('yearly')}>
                Anual (−17%)
              </button>
            </div>

            {pendingRequest && (
              <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
                <div>
                  <span className="alert-title">Solicitud pendiente</span>
                  <p className="field-hint">
                    {pendingRequest.planName} · {pendingRequest.billingCycle === 'yearly' ? 'anual' : 'mensual'}. El
                    administrador verificará tu pago antes de activarlo.
                  </p>
                </div>
              </div>
            )}

            <div className="stack" style={{ gap: '0.6rem' }}>
              {freePlan && (
                <div className="panel" style={{ display: 'grid', gap: '0.35rem' }}>
                  <div className="row-between">
                    <strong style={{ fontSize: 14 }}>{freePlan.name}</strong>
                    <span className="numeric" style={{ fontSize: 13 }}>
                      Gratis
                      <span style={{ color: 'var(--text-faint)' }}> · {freePlan.trialDays} días</span>
                    </span>
                  </div>
                  <p className="field-hint">{freePlan.description}</p>
                  {subscription.plan.key === freePlan.key ? (
                    <Button variant="ghost" size="sm" disabled>
                      Plan actual
                    </Button>
                  ) : freePlanUsed ? (
                    <Button variant="ghost" size="sm" disabled>
                      Ya utilizado
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!hasPermission(PERMISSIONS.billingManage) || saving}
                      onClick={startFree}
                    >
                      Comenzar gratis
                    </Button>
                  )}
                </div>
              )}

              {paidPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`panel ${plan.key === subscription.plan.key ? 'is-featured' : ''}`}
                  style={{ display: 'grid', gap: '0.35rem' }}
                >
                  <div className="row-between">
                    <strong style={{ fontSize: 14 }}>{plan.name}</strong>
                    <span className="numeric" style={{ fontSize: 13 }}>
                      {money(cycle === 'yearly' ? plan.priceYearlyCents : plan.priceMonthlyCents, 'USD')}
                      <span style={{ color: 'var(--text-faint)' }}> /{cycle === 'yearly' ? 'año' : 'mes'}</span>
                    </span>
                  </div>
                  <p className="field-hint">{plan.description}</p>
                  {plan.key === subscription.plan.key ? (
                    <Button variant="ghost" size="sm" disabled>
                      Plan actual
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!hasPermission(PERMISSIONS.billingManage) || Boolean(pendingRequest)}
                      onClick={() => setConfirmPlan(plan)}
                    >
                      {pendingRequest ? 'Solicitud pendiente' : `Solicitar ${plan.name}`}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <p className="field-hint" style={{ marginTop: 'var(--space-3)' }}>
              Los planes de pago se activan solo cuando el administrador confirma el pago. No se realiza ningún cobro
              automático.
            </p>
          </section>
        </div>
      </div>

      <Modal
        open={Boolean(confirmPlan)}
        onClose={() => setConfirmPlan(null)}
        title="Solicitar cambio de plan"
        subtitle={confirmPlan ? `${confirmPlan.name} · ${cycle === 'yearly' ? 'anual' : 'mensual'}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPlan(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={requestPlan} loading={saving}>
              Enviar solicitud
            </Button>
          </>
        }
      >
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          Enviaremos tu solicitud al administrador. El plan se activa cuando confirme el pago; no se realiza ningún
          cobro automático ni cambian tus límites antes de la aprobación.
        </p>
        {confirmPlan && (
          <div className="detail-meta" style={{ marginTop: 'var(--space-4)' }}>
            <div className="meta-row">
              <span>Plan</span>
              <strong>{confirmPlan.name}</strong>
            </div>
            <div className="meta-row">
              <span>Ciclo</span>
              <strong>{cycle === 'yearly' ? 'Anual' : 'Mensual'}</strong>
            </div>
            <div className="meta-row">
              <span>Monto</span>
              <strong>{money(cycle === 'yearly' ? confirmPlan.priceYearlyCents : confirmPlan.priceMonthlyCents, 'USD')}</strong>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
