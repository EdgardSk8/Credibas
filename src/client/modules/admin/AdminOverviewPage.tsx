import { useQuery } from '@tanstack/react-query';
import { Building2, CreditCard, TrendingUp, Users, Wallet, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { api, errorMessage } from '../../lib/api';
import { money } from '../../lib/format';
import type { AdminOverview } from '@shared/types';

export function AdminOverviewPage() {
  const query = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api.get<AdminOverview>('/api/admin/overview'),
  });

  if (query.isLoading) return <LoadingBlock label="Calculando métricas globales…" />;
  if (query.isError || !query.data) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(query.error)}</span>
      </div>
    );
  }

  const data = query.data;

  return (
    <>
      <PageHeader
        title="Resumen de la plataforma"
        description="Organizaciones, suscripciones y cartera global administrada en Credibas."
      />

      <div className="kpi-grid">
        <div className="kpi is-accent">
          <span className="kpi-label">MRR</span>
          <span className="kpi-value">{money(data.mrrCents, 'USD')}</span>
          <span className="kpi-meta">
            <TrendingUp size={13} /> ARR {money(data.arrCents, 'USD')}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Organizaciones</span>
          <span className="kpi-value">{data.organizations}</span>
          <span className="kpi-meta">
            <Building2 size={13} /> {data.activeSubscriptions} activas · {data.trialing} en prueba
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Usuarios</span>
          <span className="kpi-value">{data.users}</span>
          <span className="kpi-meta">
            <Users size={13} /> {data.clients} clientes registrados
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Cartera global</span>
          <span className="kpi-value">{money(data.portfolioOutstandingCents)}</span>
          <span className="kpi-meta">
            <Wallet size={13} /> {data.activeLoans} préstamos activos
          </span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Suscripciones</div>
              <div className="card-subtitle">Estado actual de la base de clientes</div>
            </div>
            <CreditCard size={18} color="var(--text-faint)" />
          </div>
          <div className="detail-meta">
            <div className="meta-row">
              <span>Activas</span>
              <strong className="numeric">{data.activeSubscriptions}</strong>
            </div>
            <div className="meta-row">
              <span>En período de prueba</span>
              <strong className="numeric">{data.trialing}</strong>
            </div>
            <div className="meta-row">
              <span>Canceladas (30 días)</span>
              <strong className="numeric">{data.canceledLast30Days}</strong>
            </div>
            <div className="meta-row">
              <span>Organizaciones totales</span>
              <strong className="numeric">{data.organizations}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div className="card-title">Notas operativas</div>
          </div>
          <div className="stack" style={{ gap: '0.75rem' }}>
            <div className="alert">
              <AlertTriangle size={15} />
              <span>Los pagos manuales deben confirmarse desde la API administrativa antes de activar un plan.</span>
            </div>
            <p className="field-hint">
              Las organizaciones con suscripción vencida conservan sus datos y pasan a modo de solo lectura según la
              política del producto.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
