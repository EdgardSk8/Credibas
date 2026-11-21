import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Search } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Input } from '../../components/ui/Field';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, TableSkeleton } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { api, buildQuery, errorMessage } from '../../lib/api';
import { dateShort, money, todayDateOnly } from '../../lib/format';
import { installmentStatus } from '../../lib/status';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { InstallmentSummary, Paginated } from '@shared/types';

interface InstallmentRow extends InstallmentSummary {
  loanId: string;
  loanCode: string;
  clientId: string;
  clientName: string;
  currency: 'NIO' | 'USD';
}

export function InstallmentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ['installments', debouncedSearch, status, from, to, page],
    queryFn: () =>
      api.get<Paginated<InstallmentRow>>(
        `/api/installments${buildQuery({
          search: debouncedSearch,
          status: status === 'all' ? undefined : status,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize: 25,
        })}`,
      ),
  });

  const filters = [
    { value: 'all', label: 'Todas' },
    { value: 'overdue', label: 'Vencidas' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'partial', label: 'Parciales' },
    { value: 'paid', label: 'Pagadas' },
  ];

  return (
    <>
      <PageHeader
        icon={<CalendarClock size={16} />}
        title="Cuotas"
        description="Todos los vencimientos de tu cartera, con saldo pendiente y estado real."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setFrom(todayDateOnly());
              setTo(todayDateOnly());
              setStatus('all');
              setPage(1);
            }}
          >
            Vencen hoy
          </Button>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Search size={15} />
          <Input
            placeholder="Buscar por cliente o préstamo"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Buscar cuotas"
          />
        </div>
        <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} aria-label="Desde" />
        <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} aria-label="Hasta" />
        <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
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
                  <th>Cliente</th>
                  <th>Préstamo</th>
                  <th>Cuota</th>
                  <th>Vence</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Pendiente</th>
                  <th className="text-right">Mora</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((installment) => (
                  <tr key={installment.id}>
                    <td>
                      <Link to={`/app/clientes/${installment.clientId}`} className="cell-strong">
                        {installment.clientName}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/app/prestamos/${installment.loanId}`} className="mono" style={{ fontSize: 12 }}>
                        {installment.loanCode}
                      </Link>
                    </td>
                    <td className="numeric">#{String(installment.number).padStart(2, '0')}</td>
                    <td>{dateShort(installment.dueDate)}</td>
                    <td className="text-right numeric">{money(installment.totalCents, installment.currency)}</td>
                    <td className="text-right numeric cell-strong">
                      {money(installment.outstandingCents, installment.currency)}
                    </td>
                    <td className="text-right numeric" style={{ color: installment.lateFeeAccruedCents > 0 ? 'var(--danger)' : undefined }}>
                      {money(installment.lateFeeAccruedCents, installment.currency)}
                    </td>
                    <td>
                      <StatusBadge map={installmentStatus} value={installment.status} />
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
              itemLabel="cuotas"
            />
          </>
        ) : (
          <EmptyState
            icon={<CalendarClock size={20} />}
            title="No hay cuotas con estos filtros"
            description="Ajusta las fechas o el estado para ver otros resultados."
          />
        )}
      </div>
    </>
  );
}
