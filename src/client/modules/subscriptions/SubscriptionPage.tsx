import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CreditCard, Gauge, Receipt } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { api, errorMessage } from '../../lib/api';
import { dateShort, money } from '../../lib/format';
import { subscriptionStatus } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { usePublicPlans } from '../../hooks/usePlans';
import { useToast } from '../../components/ui/Toasts';
import { PERMISSIONS } from '@shared/rbac';
import type { SubscriptionSummary, UsageSummary } from '@shared/types';

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
  const { plans } = usePublicPlans();

  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [confirmPlan, setConfirmPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const subscriptionQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.get<{ subscription: SubscriptionSummary }>('/api/subscriptions/current'),
  });

  const invoicesQuery = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<{ items: InvoiceItem[] }>('/api/subscriptions/invoices'),
  });

  const subscription = subscriptionQuery.data?.subscription;

  const changePlan = async () => {
    if (!confirmPlan) return;
    setSaving(true);
    try {
      await api.post('/api/subscriptions/change-plan', { planKey: confirmPlan, billingCycle: cycle });
      toast.success('Plan actualizado.');
      setConfirmPlan(null);
      await queryClient.invalidateQueries({ queryKey: ['subscription'] });
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

  if (subscriptionQuery.isLoading) return <LoadingBlock label="Cargando suscripción…" />;
  if (subscriptionQuery.isError || !subscription) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(subscriptionQuery.error)}</span>
      </div>
    );
  }

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
                {subscription.trialEndsAt && (
                  <div className="meta-row">
                    <span>Prueba termina</span>
                    <strong>{dateShort(subscription.trialEndsAt)}</strong>
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
                  Cambiar plan
                </div>
                <div className="card-subtitle">Los cambios de límites se aplican al instante.</div>
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

            <div className="stack" style={{ gap: '0.6rem' }}>
              {plans.map((plan) => (
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
                      disabled={!hasPermission(PERMISSIONS.billingManage)}
                      onClick={() => setConfirmPlan(plan.key)}
                    >
                      Cambiar a {plan.name}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <p className="field-hint" style={{ marginTop: 'var(--space-3)' }}>
              Los planes de pago requieren confirmación de pago. Mientras tanto, el cambio queda registrado y la
              suscripción conserva su estado actual.
            </p>
          </section>
        </div>
      </div>

      <Modal
        open={Boolean(confirmPlan)}
        onClose={() => setConfirmPlan(null)}
        title="Cambiar de plan"
        subtitle={`Plan ${confirmPlan ?? ''} · ${cycle === 'yearly' ? 'anual' : 'mensual'}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPlan(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={changePlan} loading={saving}>
              Confirmar cambio
            </Button>
          </>
        }
      >
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          El nuevo plan reemplazará los límites actuales. Si eliges un plan de pago, la activación definitiva ocurre
          cuando el equipo confirme el pago; tus datos nunca se eliminan por cambiar de plan.
        </p>
      </Modal>
    </>
  );
}
