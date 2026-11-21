import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { api, buildQuery, errorMessage } from '../../lib/api';
import { dateShort, money, todayDateOnly } from '../../lib/format';
import { useAuth } from '../../hooks/useAuth';
import { PERMISSIONS } from '@shared/rbac';
import type { Currency } from '@shared/finance/types';

interface PortfolioReport {
  totalPrincipalCents: number;
  totalRecoveredCents: number;
  totalInterestCents: number;
  totalInterestCollectedCents: number;
  outstandingCents: number;
  overdueCents: number;
  activeLoans: number;
  settledLoans: number;
  overdueLoans: number;
  morosityPercent: number;
  currency: Currency;
}

interface AgingResponse {
  currency: Currency;
  buckets: Array<{ bucket: string; count: number; amountCents: number }>;
}

interface SeriesResponse {
  from: string;
  to: string;
  series: Array<{ period: string; count?: number; totalCents?: number; incomeCents?: number; expenseCents?: number }>;
}

function monthStart(): string {
  return `${todayDateOnly().slice(0, 7)}-01`;
}

export function ReportsPage() {
  const { activeMembership, hasPermission } = useAuth();
  const [currency, setCurrency] = useState<Currency>((activeMembership?.currency as Currency) ?? 'NIO');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayDateOnly());

  const portfolioQuery = useQuery({
    queryKey: ['report-portfolio', currency],
    queryFn: () => api.get<PortfolioReport>(`/api/reports/portfolio${buildQuery({ currency })}`),
  });

  const agingQuery = useQuery({
    queryKey: ['report-aging', currency],
    queryFn: () => api.get<AgingResponse>(`/api/reports/aging${buildQuery({ currency })}`),
  });

  const paymentsQuery = useQuery({
    queryKey: ['report-payments', from, to],
    queryFn: () => api.get<SeriesResponse>(`/api/reports/payments${buildQuery({ from, to })}`),
  });

  const cashflowQuery = useQuery({
    queryKey: ['report-cashflow', from, to],
    queryFn: () => api.get<SeriesResponse>(`/api/reports/cashflow${buildQuery({ from, to })}`),
  });

  if (portfolioQuery.isLoading) return <LoadingBlock label="Generando reportes…" />;
  if (portfolioQuery.isError || !portfolioQuery.data) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(portfolioQuery.error)}</span>
      </div>
    );
  }

  const portfolio = portfolioQuery.data;
  const aging = agingQuery.data?.buckets ?? [];
  const maxAging = Math.max(1, ...aging.map((bucket) => bucket.amountCents));
  const paymentsSeries = paymentsQuery.data?.series ?? [];
  const maxPayments = Math.max(1, ...paymentsSeries.map((item) => item.totalCents ?? 0));
  const cashflow = cashflowQuery.data?.series ?? [];
  const maxCashflow = Math.max(1, ...cashflow.map((item) => Math.max(item.incomeCents ?? 0, item.expenseCents ?? 0)));

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Cartera, morosidad, pagos y flujo de caja con datos reales del negocio."
        actions={
          <>
            <select className="select" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)} aria-label="Moneda">
              <option value="NIO">Córdobas (NIO)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
            {hasPermission(PERMISSIONS.reportsExport) && (
              <Button
                variant="secondary"
                icon={<Download size={16} />}
                onClick={() => {
                  window.location.href = `/api/reports/export/portfolio.csv?currency=${currency}`;
                }}
              >
                Exportar cartera
              </Button>
            )}
          </>
        }
      />

      <div className="kpi-grid">
        <div className="kpi is-accent">
          <span className="kpi-label">Saldo pendiente</span>
          <span className="kpi-value">{money(portfolio.outstandingCents, currency)}</span>
          <span className="kpi-meta">{portfolio.activeLoans} préstamo(s) activo(s)</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Saldo vencido</span>
          <span className="kpi-value" style={{ color: portfolio.overdueCents > 0 ? 'var(--danger)' : undefined }}>
            {money(portfolio.overdueCents, currency)}
          </span>
          <span className="kpi-meta">{portfolio.overdueLoans} préstamo(s) en mora</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Morosidad</span>
          <span className="kpi-value">{portfolio.morosityPercent}%</span>
          <span className="kpi-meta">Sobre cartera pendiente</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Capital recuperado</span>
          <span className="kpi-value">{money(portfolio.totalRecoveredCents, currency)}</span>
          <span className="kpi-meta">Acumulado histórico</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Envejecimiento de cartera</div>
              <div className="card-subtitle">Cuotas vencidas por rango de atraso</div>
            </div>
            <FileBarChart size={18} color="var(--text-faint)" />
          </div>

          {aging.length === 0 || aging.every((bucket) => bucket.count === 0) ? (
            <p className="field-hint">Sin cuotas vencidas en {currency}. Excelente señal.</p>
          ) : (
            <div className="stack" style={{ gap: '0.8rem' }}>
              {aging.map((bucket) => (
                <div key={bucket.bucket} className="usage-row">
                  <div className="usage-label">
                    <strong>{bucket.bucket} días</strong>
                    <span>
                      {bucket.count} cuota(s) · {money(bucket.amountCents, currency)}
                    </span>
                  </div>
                  <div className={`progress ${bucket.bucket === '90+' ? 'progress-danger' : bucket.bucket === '61-90' ? 'progress-warning' : ''}`}>
                    <span style={{ width: `${Math.round((bucket.amountCents / maxAging) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Intereses</div>
              <div className="card-subtitle">Generados vs. cobrados</div>
            </div>
          </div>
          <div className="stack" style={{ gap: '1rem' }}>
            <div className="usage-row">
              <div className="usage-label">
                <strong>Generados</strong>
                <span>{money(portfolio.totalInterestCents, currency)}</span>
              </div>
              <div className="progress">
                <span style={{ width: '100%' }} />
              </div>
            </div>
            <div className="usage-row">
              <div className="usage-label">
                <strong>Cobrados</strong>
                <span>{money(portfolio.totalInterestCollectedCents, currency)}</span>
              </div>
              <div className="progress">
                <span
                  style={{
                    width: `${portfolio.totalInterestCents > 0 ? Math.min(100, Math.round((portfolio.totalInterestCollectedCents / portfolio.totalInterestCents) * 100)) : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="detail-meta">
              <div className="meta-row">
                <span>Capital colocado</span>
                <strong>{money(portfolio.totalPrincipalCents, currency)}</strong>
              </div>
              <div className="meta-row">
                <span>Préstamos liquidados</span>
                <strong className="numeric">{portfolio.settledLoans}</strong>
              </div>
              <div className="meta-row">
                <span>Préstamos activos</span>
                <strong className="numeric">{portfolio.activeLoans}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Pagos por día</div>
              <div className="card-subtitle">
                {dateShort(from)} — {dateShort(to)}
              </div>
            </div>
            <div className="row" style={{ gap: '0.4rem' }}>
              <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} style={{ minHeight: 32, padding: '0.2rem 0.5rem' }} />
              <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} style={{ minHeight: 32, padding: '0.2rem 0.5rem' }} />
            </div>
          </div>

          {paymentsSeries.length === 0 ? (
            <p className="field-hint">Sin pagos registrados en este período.</p>
          ) : (
            <>
              <div className="bars" style={{ height: 150 }}>
                {paymentsSeries.map((item) => (
                  <div className="bars-bar" key={item.period}>
                    <span
                      style={{ height: `${Math.max(3, ((item.totalCents ?? 0) / maxPayments) * 100)}%` }}
                      title={`${item.period}: ${money(item.totalCents ?? 0, currency)}`}
                    />
                  </div>
                ))}
              </div>
              <div className="row-between" style={{ marginTop: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                <span>{dateShort(paymentsSeries[0]?.period ?? from)}</span>
                <span>Total: {money(paymentsSeries.reduce((total, item) => total + (item.totalCents ?? 0), 0), currency)}</span>
                <span>{dateShort(paymentsSeries[paymentsSeries.length - 1]?.period ?? to)}</span>
              </div>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Flujo de caja</div>
              <div className="card-subtitle">Ingresos vs. egresos de caja</div>
            </div>
          </div>

          {cashflow.length === 0 ? (
            <p className="field-hint">Sin movimientos de caja en este período.</p>
          ) : (
            <>
              <div className="bars" style={{ height: 150 }}>
                {cashflow.map((item) => (
                  <div className="bars-bar" key={item.period} style={{ gap: 4 }}>
                    <span
                      style={{ height: `${Math.max(3, ((item.incomeCents ?? 0) / maxCashflow) * 100)}%` }}
                      title={`Ingresos: ${money(item.incomeCents ?? 0, currency)}`}
                    />
                    <span
                      className="bar-muted"
                      style={{ height: `${Math.max(3, ((item.expenseCents ?? 0) / maxCashflow) * 100)}%` }}
                      title={`Egresos: ${money(item.expenseCents ?? 0, currency)}`}
                    />
                  </div>
                ))}
              </div>
              <div className="legend" style={{ marginTop: '0.5rem' }}>
                <span className="legend-item">
                  <i className="legend-swatch" style={{ background: 'var(--accent)' }} /> Ingresos
                </span>
                <span className="legend-item">
                  <i className="legend-swatch" style={{ background: 'rgba(240,244,242,0.2)' }} /> Egresos
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
