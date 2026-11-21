import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, Plus, Search, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState, TableSkeleton } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { api, buildQuery, errorMessage } from '../../lib/api';
import { money, dateShort } from '../../lib/format';
import { loanStatus } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { PERMISSIONS } from '@shared/rbac';
import type { LoanSummary, Paginated } from '@shared/types';

export function LoansPage() {
  const { activeMembership, hasPermission } = useAuth();
  const currency = activeMembership?.currency ?? 'NIO';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ['loans', debouncedSearch, status, page],
    queryFn: () =>
      api.get<Paginated<LoanSummary>>(
        `/api/loans${buildQuery({ search: debouncedSearch, status: status === 'all' ? undefined : status, page, pageSize: 20 })}`,
      ),
  });

  const filters = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'overdue', label: 'Con mora' },
    { value: 'settled', label: 'Liquidados' },
    { value: 'cancelled', label: 'Cancelados' },
  ];

  return (
    <>
      <PageHeader
        icon={<Wallet size={16} />}
        title="Préstamos"
        description="Cartera colocada, saldos pendientes y estado de cada crédito."
        actions={
          <>
            {hasPermission(PERMISSIONS.reportsExport) && (
              <Button
                variant="secondary"
                icon={<Download size={16} />}
                onClick={() => {
                  window.location.href = '/api/loans/export.csv';
                }}
              >
                Exportar CSV
              </Button>
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

      <div className="toolbar">
        <div className="search">
          <Search size={15} />
          <Input
            placeholder="Buscar por cliente o código de préstamo"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Buscar préstamos"
          />
        </div>
        <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className="tab"
              aria-selected={status === filter.value}
              style={{
                height: 34,
                border: '1px solid var(--border)',
                background: status === filter.value ? 'var(--surface-3)' : 'transparent',
                color: status === filter.value ? 'var(--text)' : 'var(--text-faint)',
                borderRadius: 'var(--radius-sm)',
              }}
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        {query.isLoading ? (
          <TableSkeleton />
        ) : query.isError ? (
          <div className="alert alert-danger" style={{ margin: '1rem' }}>
            <span>{errorMessage(query.error)}</span>
          </div>
        ) : query.data && query.data.items.length > 0 ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Préstamo</th>
                  <th>Cliente</th>
                  <th className="text-right">Capital</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Pendiente</th>
                  <th className="text-right">Vencido</th>
                  <th>Progreso</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((loan) => (
                  <tr key={loan.id}>
                    <td>
                      <div style={{ display: 'grid' }}>
                        <Link to={`/app/prestamos/${loan.id}`} className="cell-strong">
                          {loan.code}
                        </Link>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                          {dateShort(loan.disbursementDate)} · {loan.installmentCount} cuotas
                        </span>
                      </div>
                    </td>
                    <td>{loan.clientName}</td>
                    <td className="text-right numeric">{money(loan.principalCents, loan.currency)}</td>
                    <td className="text-right numeric">{money(loan.totalToPayCents, loan.currency)}</td>
                    <td className="text-right numeric cell-strong">{money(loan.metrics.outstandingCents, loan.currency)}</td>
                    <td
                      className="text-right numeric"
                      style={{ color: loan.metrics.overdueCents > 0 ? 'var(--danger)' : undefined }}
                    >
                      {money(loan.metrics.overdueCents, loan.currency)}
                    </td>
                    <td style={{ minWidth: 120 }}>
                      <div className="row" style={{ gap: '0.4rem' }}>
                        <div className="progress grow">
                          <span style={{ width: `${loan.metrics.progressPercent}%` }} />
                        </div>
                        <span className="numeric" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                          {loan.metrics.progressPercent}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge map={loanStatus} value={loan.status} />
                    </td>
                    <td className="cell-actions">
                      <Link to={`/app/prestamos/${loan.id}`} className="btn btn-sm">
                        <Eye size={13} />
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={query.data.page}
              totalPages={query.data.totalPages}
              total={query.data.total}
              pageSize={query.data.pageSize}
              onPageChange={setPage}
              itemLabel="préstamos"
            />
          </>
        ) : (
          <EmptyState
            icon={<Wallet size={20} />}
            title="Sin préstamos registrados"
            description="Crea tu primer préstamo y Credibas generará el calendario de cuotas automáticamente."
            action={
              hasPermission(PERMISSIONS.loansWrite) ? (
                <Link to="/app/prestamos/nuevo">
                  <Button variant="primary" icon={<Plus size={16} />}>
                    Nuevo préstamo
                  </Button>
                </Link>
              ) : undefined
            }
          />
        )}
      </div>

      <p className="field-hint" style={{ marginTop: '0.75rem' }}>
        Moneda principal del negocio: {currency}. Cada préstamo conserva su moneda original.
      </p>
    </>
  );
}
