import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  LayoutDashboard,
  Plus,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState, LoadingBlock } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { api, errorMessage } from '../../lib/api';
import { money, dateShort, relativeTime } from '../../lib/format';
import { useAuth } from '../../hooks/useAuth';
import { PERMISSIONS } from '@shared/rbac';
import type { DashboardMetrics } from '@shared/types';

const activityIcons: Record<string, typeof Wallet> = {
  payment: BadgeDollarSign,
  loan: Wallet,
  client: Users,
};

export function DashboardPage() {
  const { activeMembership, hasPermission } = useAuth();
  const currency = activeMembership?.currency ?? 'NIO';

  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardMetrics>('/api/reports/dashboard'),
  });

  if (query.isLoading) return <LoadingBlock label="Calculando tu cartera…" />;
  if (query.isError) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(query.error)}</span>
      </div>
    );
  }

  if (!query.data) return <LoadingBlock label="Calculando tu cartera…" />;

  const data = query.data;
  const totals = data.totals;
  const collectionProgress =
    totals.expectedTodayCents > 0 ? Math.min(100, Math.round((totals.collectedTodayCents / totals.expectedTodayCents) * 100)) : 0;
  const maxMonthly = Math.max(1, ...data.monthly.map((item) => Math.max(item.disbursedCents, item.collectedCents)));

  return (
    <>
      <PageHeader
        icon={<LayoutDashboard size={16} />}
        title={`Hola, ${activeMembership?.orgName ?? ''}`}
        description="Este es el pulso de tu cartera hoy. Los indicadores se calculan con tus datos reales."
        actions={
          <>
            {hasPermission(PERMISSIONS.paymentsWrite) && (
              <Link to="/app/pagos?action=new">
                <Button variant="secondary" icon={<BadgeDollarSign size={16} />}>
                  Registrar pago
                </Button>
              </Link>
            )}
            {hasPermission(PERMISSIONS.clientsWrite) && (
              <Link to="/app/clientes?action=new">
                <Button variant="secondary" icon={<Plus size={16} />}>
                  Cliente
                </Button>
              </Link>
            )}
            {hasPermission(PERMISSIONS.loansWrite) && (
              <Link to="/app/prestamos/nuevo">
                <Button variant="primary" icon={<Plus size={16} />}>
                  Nuevo préstamo
                </Button>
              </Link>
            )}
          </>
        }
      />

      <div className="kpi-grid">
        <div className="kpi is-accent">
          <span className="kpi-label">Cartera pendiente</span>
          <span className="kpi-value">{money(totals.portfolioOutstandingCents, currency)}</span>
          <span className="kpi-meta">
            <Wallet size={13} />
            {totals.activeLoans} préstamo(s) activo(s)
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Capital colocado</span>
          <span className="kpi-value">{money(totals.capitalDisbursedCents, currency)}</span>
          <span className="kpi-meta">
            <TrendingUp size={13} color="var(--accent)" />
            Últimos 30 días
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Cobrado hoy</span>
          <span className="kpi-value">{money(totals.collectedTodayCents, currency)}</span>
          <span className="kpi-meta">
            <CircleDollarSign size={13} />
            Esperado: {money(totals.expectedTodayCents, currency)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Cartera vencida</span>
          <span className="kpi-value" style={{ color: totals.overdueAmountCents > 0 ? 'var(--danger)' : undefined }}>
            {money(totals.overdueAmountCents, currency)}
          </span>
          <span className="kpi-meta">
            <TrendingDown size={13} color={totals.overdueAmountCents > 0 ? 'var(--danger)' : 'var(--text-faint)'} />
            {totals.overdueInstallments} cuota(s) vencida(s)
          </span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-stack">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <BarChart3 size={13} />
                  </span>
                  Colocación vs. cobranza
                </div>
                <div className="card-subtitle">Últimos 6 meses · {currency}</div>
              </div>
              <div className="legend">
                <span className="legend-item">
                  <i className="legend-swatch" style={{ background: 'var(--accent)' }} /> Cobrado
                </span>
                <span className="legend-item">
                  <i className="legend-swatch" style={{ background: 'rgba(240,244,242,0.2)' }} /> Colocado
                </span>
              </div>
            </div>

            {data.monthly.length === 0 ? (
              <EmptyState
                icon={<BarChartFallback />}
                title="Aún no hay historial"
                description="Cuando registres préstamos y pagos verás aquí la evolución de tu cartera."
              />
            ) : (
              <>
                <div className="bars" style={{ height: 170 }}>
                  {data.monthly.map((item) => (
                    <div className="bars-bar" key={item.month} style={{ gap: 5 }}>
                      <span
                        className="bar-muted"
                        style={{ height: `${Math.max(3, (item.disbursedCents / maxMonthly) * 100)}%` }}
                        title={`Colocado: ${money(item.disbursedCents, currency)}`}
                      />
                      <span
                        style={{ height: `${Math.max(3, (item.collectedCents / maxMonthly) * 100)}%` }}
                        title={`Cobrado: ${money(item.collectedCents, currency)}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="bars-labels">
                  {data.monthly.map((item) => (
                    <span key={item.month}>
                      {new Date(`${item.month}-01T12:00:00Z`).toLocaleDateString('es-NI', { month: 'short' })}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <CalendarClock size={13} />
                  </span>
                  Próximos vencimientos
                </div>
                <div className="card-subtitle">Cuotas pendientes ordenadas por fecha</div>
              </div>
              <Link to="/app/cuotas" className="link" style={{ fontSize: 'var(--text-xs)' }}>
                Ver todas
              </Link>
            </div>

            {data.upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarClock size={20} />}
                title="Sin cuotas pendientes"
                description="No hay cuotas por vencer en este momento."
              />
            ) : (
              <div className="dash-list">
                {data.upcoming.map((item) => (
                  <Link to={`/app/prestamos/${item.loanId}`} key={item.installmentId} className="dash-row">
                    <div className="dash-row-main">
                      <strong>{item.clientName}</strong>
                      <span>
                        {item.loanCode} · vence {dateShort(item.dueDate)}
                      </span>
                    </div>
                    <div className="dash-row-amount">
                      {money(item.totalCents, currency)}
                      <small>
                        {item.overdue ? (
                          <Badge tone="danger" dot>
                            Vencida
                          </Badge>
                        ) : (
                          dateShort(item.dueDate)
                        )}
                      </small>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="dashboard-stack">
          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-chip">
                  <CircleDollarSign size={13} />
                </span>
                Cobranza de hoy
              </div>
            </div>
            <div className="stack" style={{ gap: '0.5rem' }}>
              <div className="row-between">
                <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                  {money(totals.collectedTodayCents, currency)} de {money(totals.expectedTodayCents, currency)}
                </span>
                <strong className="numeric" style={{ fontSize: 'var(--text-sm)' }}>
                  {collectionProgress}%
                </strong>
              </div>
              <div className={`progress ${collectionProgress < 50 ? 'progress-warning' : ''}`}>
                <span style={{ width: `${collectionProgress}%` }} />
              </div>
              <p className="field-hint">
                {totals.expectedTodayCents === 0
                  ? 'Hoy no hay cuotas programadas.'
                  : collectionProgress >= 100
                    ? 'Cobro del día completado. Excelente.'
                    : 'Registra los pagos del día para mantener la cartera al día.'}
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-chip">
                  <Wallet size={13} />
                </span>
                Resumen del negocio
              </div>
            </div>
            <div className="detail-meta">
              <div className="meta-row">
                <span>Clientes</span>
                <strong className="numeric">{totals.clients}</strong>
              </div>
              <div className="meta-row">
                <span>Préstamos liquidados (30 d)</span>
                <strong className="numeric">{totals.settledLoans}</strong>
              </div>
              <div className="meta-row">
                <span>Capital recuperado</span>
                <strong className="numeric">{money(totals.capitalRecoveredCents, currency)}</strong>
              </div>
              <div className="meta-row">
                <span>Cuotas vencidas</span>
                <strong className="numeric" style={{ color: totals.overdueInstallments ? 'var(--danger)' : undefined }}>
                  {totals.overdueInstallments}
                </strong>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-chip">
                  <Activity size={13} />
                </span>
                Actividad reciente
              </div>
            </div>
            {data.recentActivity.length === 0 ? (
              <p className="field-hint">Aún no hay movimientos registrados.</p>
            ) : (
              <div>
                {data.recentActivity.map((item) => {
                  const Icon = activityIcons[item.type] ?? CircleDollarSign;
                  return (
                    <div className="activity-item" key={item.id}>
                      <span className="activity-icon">
                        <Icon size={14} />
                      </span>
                      <div className="activity-main">
                        <p>{item.title}</p>
                        <span>
                          {relativeTime(item.createdAt)}
                          {item.actorName ? ` · ${item.actorName}` : ''}
                        </span>
                      </div>
                      {item.amountCents !== null && (
                        <strong className="numeric" style={{ fontSize: 'var(--text-xs)' }}>
                          {money(item.amountCents, currency)}
                        </strong>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <Link to="/app/reportes" className="card" style={{ display: 'block' }}>
            <div className="row-between">
              <div>
                <div className="card-title">Ver reportes completos</div>
                <div className="card-subtitle">Morosidad, aging y flujo de caja</div>
              </div>
              <ArrowUpRight size={18} color="var(--accent)" />
            </div>
          </Link>

          <Link to="/app/cobros" className="card" style={{ display: 'block' }}>
            <div className="row-between">
              <div>
                <div className="card-title">Agenda de cobros</div>
                <div className="card-subtitle">Gestiona vencidos y promesas de pago</div>
              </div>
              <ArrowRight size={18} color="var(--accent)" />
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}

function BarChartFallback() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  );
}
