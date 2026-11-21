import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Search, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { EmptyState, TableSkeleton } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { ClientFormModal } from './ClientFormModal';
import { api, buildQuery, errorMessage } from '../../lib/api';
import { money, dateShort } from '../../lib/format';
import { clientStatus } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { PERMISSIONS } from '@shared/rbac';
import type { ClientSummary, Paginated } from '@shared/types';

export function ClientsPage() {
  const { activeMembership, hasPermission } = useAuth();
  const currency = activeMembership?.currency ?? 'NIO';
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const query = useQuery({
    queryKey: ['clients', debouncedSearch, status, page],
    queryFn: () =>
      api.get<Paginated<ClientSummary>>(
        `/api/clients${buildQuery({ search: debouncedSearch, status: status === 'all' ? undefined : status, page, pageSize: 20 })}`,
      ),
  });

  const refresh = () => {
    setModalOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cada cliente guarda su expediente, historial crediticio y documentos."
        actions={
          <>
            {hasPermission(PERMISSIONS.reportsExport) && (
              <Button
                variant="secondary"
                icon={<Download size={16} />}
                onClick={() => {
                  window.location.href = '/api/clients/export.csv';
                }}
              >
                Exportar CSV
              </Button>
            )}
            {hasPermission(PERMISSIONS.clientsWrite) && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>
                Nuevo cliente
              </Button>
            )}
          </>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Search size={15} />
          <Input
            className="input"
            placeholder="Buscar por nombre, código, identificación o teléfono"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Buscar clientes"
          />
        </div>

        <div className="row" style={{ gap: '0.4rem' }}>
          {[
            { value: 'all', label: 'Todos' },
            { value: 'active', label: 'Activos' },
            { value: 'inactive', label: 'Inactivos' },
            { value: 'blocked', label: 'Bloqueados' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className="tab"
              aria-selected={status === option.value}
              style={{
                height: 34,
                border: '1px solid var(--border)',
                background: status === option.value ? 'var(--surface-3)' : 'transparent',
                color: status === option.value ? 'var(--text)' : 'var(--text-faint)',
                borderRadius: 'var(--radius-sm)',
              }}
              onClick={() => {
                setStatus(option.value);
                setPage(1);
              }}
            >
              {option.label}
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
                  <th>Contacto</th>
                  <th>Préstamos</th>
                  <th className="text-right">Saldo pendiente</th>
                  <th className="text-right">Saldo vencido</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <div style={{ display: 'grid' }}>
                        <Link to={`/app/clientes/${client.id}`} className="cell-strong">
                          {client.fullName}
                        </Link>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                          {client.code} {client.identification ? `· ${client.identification}` : ''}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', fontSize: 12 }}>
                        {client.phone ?? '—'}
                        {client.email && <span style={{ color: 'var(--text-faint)' }}>{client.email}</span>}
                      </div>
                    </td>
                    <td>
                      <Badge tone={client.stats?.activeLoans ? 'accent' : 'neutral'}>
                        {client.stats?.activeLoans ?? 0} activo(s)
                      </Badge>
                    </td>
                    <td className="text-right numeric">{money(client.stats?.outstandingCents ?? 0, currency)}</td>
                    <td className="text-right numeric" style={{ color: (client.stats?.overdueCents ?? 0) > 0 ? 'var(--danger)' : undefined }}>
                      {money(client.stats?.overdueCents ?? 0, currency)}
                    </td>
                    <td>
                      <StatusBadge map={clientStatus} value={client.status} />
                    </td>
                    <td className="cell-actions">
                      <Link to={`/app/clientes/${client.id}`} className="btn btn-sm">
                        Ver ficha
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
              itemLabel="clientes"
            />
          </>
        ) : (
          <EmptyState
            icon={<Users size={20} />}
            title="Aún no tienes clientes"
            description="Registra a tu primer cliente para empezar a crear préstamos y llevar su historial."
            action={
              hasPermission(PERMISSIONS.clientsWrite) ? (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>
                  Registrar cliente
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      <p className="field-hint" style={{ marginTop: '0.75rem' }}>
        Última actualización de la lista: {query.dataUpdatedAt ? dateShort(new Date(query.dataUpdatedAt).toISOString()) : '—'}
      </p>

      <ClientFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={refresh} />
    </>
  );
}
