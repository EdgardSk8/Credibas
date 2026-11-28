import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { api, errorMessage } from '../../lib/api';
import { dateShort, money } from '../../lib/format';
import { useToast } from '../../components/ui/Toasts';

interface ProviderStatus {
  provider: { key: string; supportsRecurring: boolean; configured: boolean; missing: string[] };
  paymentMethods: { total: number; active: number };
}

interface UpcomingCharge {
  orgId: string;
  orgName: string;
  planKey: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  dueAt: string;
  status: string;
  autoCharge: boolean;
}

interface BillingAttempt {
  id: string;
  orgId: string;
  orgName: string;
  invoiceNumber: string | null;
  amountCents: number;
  currency: 'USD' | 'NIO';
  status: string;
  attemptNo: number;
  errorCode: string | null;
  errorMessage: string | null;
  nextRetryAt: string | null;
  createdAt: string;
}

const ATTEMPT_LABELS: Record<string, string> = {
  pending: 'Enviado',
  confirmed: 'Confirmado',
  failed: 'Rechazado',
  refunded: 'Reembolsado',
};

const SUBSCRIPTION_STATUS: Record<string, string> = {
  active: 'Activa',
  trialing: 'En prueba',
  past_due: 'En tolerancia',
  canceled: 'Cancelada',
  expired: 'Vencida',
};

export function AdminPaymentsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const statusQuery = useQuery({
    queryKey: ['admin-billing-status'],
    queryFn: () => api.get<ProviderStatus>('/api/admin/billing/status'),
  });

  const upcomingQuery = useQuery({
    queryKey: ['admin-billing-upcoming'],
    queryFn: () => api.get<{ items: UpcomingCharge[] }>('/api/admin/billing/upcoming'),
  });

  const attemptsQuery = useQuery({
    queryKey: ['admin-billing-attempts'],
    queryFn: () => api.get<{ items: BillingAttempt[] }>('/api/admin/billing/attempts'),
  });

  const retry = async (id: string) => {
    try {
      await api.post(`/api/admin/billing/attempts/${id}/retry`);
      toast.success('Reintento programado para el próximo ciclo.');
      await queryClient.invalidateQueries({ queryKey: ['admin-billing-attempts'] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (statusQuery.isLoading) return <LoadingBlock label="Cargando pagos…" />;

  const status = statusQuery.data;
  const upcoming = upcomingQuery.data?.items ?? [];
  const attempts = attemptsQuery.data?.items ?? [];

  return (
    <>
      <PageHeader
        icon={<Wallet size={16} />}
        title="Pagos"
        description="Estado de la integración bancaria, próximos cobros e intentos."
      />

      <div className="dashboard-stack">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Integración</div>
              <div className="card-subtitle">
                Las credenciales bancarias viven como secretos del Worker y nunca se muestran aquí.
              </div>
            </div>
          </div>
          {status && (
            <div className="detail-meta">
              <div className="meta-row">
                <span>Proveedor</span>
                <strong>{status.provider.key}</strong>
              </div>
              <div className="meta-row">
                <span>Cobro automático</span>
                <strong>{status.provider.supportsRecurring ? 'Disponible' : 'No disponible'}</strong>
              </div>
              <div className="meta-row">
                <span>Configuración</span>
                <strong>{status.provider.configured ? 'Completa' : 'Incompleta'}</strong>
              </div>
              {status.provider.missing.length > 0 && (
                <div className="meta-row">
                  <span>Faltan variables</span>
                  <strong>{status.provider.missing.join(', ')}</strong>
                </div>
              )}
              <div className="meta-row">
                <span>Tarjetas registradas</span>
                <strong>
                  {status.paymentMethods.active} activas de {status.paymentMethods.total}
                </strong>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Próximos cobros</div>
              <div className="card-subtitle">Suscripciones que vencen en los próximos 30 días.</div>
            </div>
          </div>
          {upcoming.length === 0 ? (
            <p className="field-hint">No hay cobros programados en este período.</p>
          ) : (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Organización</th>
                    <th>Plan</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Cobro</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((charge) => (
                    <tr key={charge.orgId}>
                      <td>{charge.orgName}</td>
                      <td>
                        {charge.planName} · {charge.billingCycle === 'yearly' ? 'anual' : 'mensual'}
                      </td>
                      <td>{dateShort(charge.dueAt)}</td>
                      <td>{SUBSCRIPTION_STATUS[charge.status] ?? charge.status}</td>
                      <td>{charge.autoCharge ? 'Automático' : 'Manual'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Intentos de cobro</div>
              <div className="card-subtitle">Incluye rechazos y reintentos programados.</div>
            </div>
          </div>
          {attempts.length === 0 ? (
            <p className="field-hint">Todavía no hay intentos de cobro automático.</p>
          ) : (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Organización</th>
                    <th>Factura</th>
                    <th className="text-right">Monto</th>
                    <th>Intento</th>
                    <th>Estado</th>
                    <th>Nota</th>
                    <th>Reintento</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>{attempt.orgName}</td>
                      <td>{attempt.invoiceNumber ?? '—'}</td>
                      <td className="text-right">{money(attempt.amountCents, attempt.currency)}</td>
                      <td>#{attempt.attemptNo}</td>
                      <td>{ATTEMPT_LABELS[attempt.status] ?? attempt.status}</td>
                      <td>{attempt.errorMessage ?? attempt.errorCode ?? '—'}</td>
                      <td>{attempt.nextRetryAt ? dateShort(attempt.nextRetryAt) : '—'}</td>
                      <td>
                        {attempt.status === 'failed' && (
                          <Button variant="ghost" onClick={() => retry(attempt.id)}>
                            Reintentar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
