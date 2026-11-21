import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Search } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, TableSkeleton } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { Modal } from '../../components/ui/Modal';
import { api, buildQuery, errorMessage } from '../../lib/api';
import { dateShort, money } from '../../lib/format';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useToast } from '../../components/ui/Toasts';
import type { Paginated, PlanSummary } from '@shared/types';

interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'closed';
  currency: 'NIO' | 'USD';
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  planKey: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  membersCount: number;
  clientsCount: number;
  activeLoansCount: number;
  portfolioOutstandingCents: number;
}

export function AdminOrganizationsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminOrgRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ status: 'active', planKey: '', subscriptionStatus: '', trialDays: '' });
  const debouncedSearch = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ['admin-orgs', debouncedSearch, status, page],
    queryFn: () =>
      api.get<Paginated<AdminOrgRow>>(
        `/api/admin/organizations${buildQuery({
          search: debouncedSearch,
          status: status === 'all' ? undefined : status,
          page,
          pageSize: 20,
        })}`,
      ),
  });

  const plansQuery = useQuery({
    queryKey: ['admin-plans-select'],
    queryFn: () => api.get<{ items: PlanSummary[] }>('/api/admin/plans'),
  });

  useEffect(() => {
    if (!editing) return;
    setForm({
      status: editing.status,
      planKey: editing.planKey,
      subscriptionStatus: editing.subscriptionStatus,
      trialDays: '',
    });
  }, [editing]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/organizations/${editing.id}`, {
        status: form.status,
        planKey: form.planKey || undefined,
        subscriptionStatus: form.subscriptionStatus || undefined,
        trialDays: form.trialDays ? Number(form.trialDays) : undefined,
      });
      toast.success('Organización actualizada.');
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-orgs'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Organizaciones"
        description="Cada negocio con su suscripción, consumo y estado operativo."
      />

      <div className="toolbar">
        <div className="search">
          <Search size={15} />
          <Input
            placeholder="Buscar por negocio, propietario o correo"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Buscar organizaciones"
          />
        </div>
        <select className="select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="all">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="suspended">Suspendidas</option>
          <option value="closed">Cerradas</option>
        </select>
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
                  <th>Negocio</th>
                  <th>Propietario</th>
                  <th>Suscripción</th>
                  <th className="text-right">Miembros</th>
                  <th className="text-right">Clientes</th>
                  <th className="text-right">Cartera</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <div style={{ display: 'grid' }}>
                        <strong style={{ fontSize: 13 }}>{org.name}</strong>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                          {org.slug} · {dateShort(org.createdAt)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', fontSize: 12 }}>
                        {org.ownerName}
                        <span style={{ color: 'var(--text-faint)' }}>{org.ownerEmail}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: 3 }}>
                        <Badge tone="accent">{org.planKey}</Badge>
                        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{org.subscriptionStatus}</span>
                      </div>
                    </td>
                    <td className="text-right numeric">{org.membersCount}</td>
                    <td className="text-right numeric">{org.clientsCount}</td>
                    <td className="text-right numeric">{money(org.portfolioOutstandingCents, org.currency)}</td>
                    <td>
                      <Badge tone={org.status === 'active' ? 'success' : org.status === 'suspended' ? 'warning' : 'neutral'}>
                        {org.status}
                      </Badge>
                    </td>
                    <td className="cell-actions">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(org)}>
                        Gestionar
                      </Button>
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
              itemLabel="organizaciones"
            />
          </>
        ) : (
          <EmptyState icon={<Building2 size={20} />} title="Sin organizaciones" description="Aún no hay negocios registrados." />
        )}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ''}
        subtitle={editing?.ownerEmail}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cerrar
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Guardar cambios
            </Button>
          </>
        }
      >
        <div className="stack">
          <Select
            label="Estado de la organización"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value })}
            options={[
              { value: 'active', label: 'Activa' },
              { value: 'suspended', label: 'Suspendida' },
              { value: 'closed', label: 'Cerrada' },
            ]}
          />
          <Select
            label="Plan"
            value={form.planKey}
            onChange={(event) => setForm({ ...form, planKey: event.target.value })}
            options={[
              { value: '', label: 'Mantener plan actual' },
              ...(plansQuery.data?.items ?? []).map((plan) => ({ value: plan.key, label: plan.name })),
            ]}
          />
          <Select
            label="Estado de suscripción"
            value={form.subscriptionStatus}
            onChange={(event) => setForm({ ...form, subscriptionStatus: event.target.value })}
            options={[
              { value: '', label: 'Mantener estado actual' },
              { value: 'trialing', label: 'En prueba' },
              { value: 'active', label: 'Activa' },
              { value: 'past_due', label: 'Pago pendiente' },
              { value: 'canceled', label: 'Cancelada' },
              { value: 'expired', label: 'Expirada' },
            ]}
          />
          <Input
            label="Conceder días de prueba"
            type="number"
            min={0}
            value={form.trialDays}
            onChange={(event) => setForm({ ...form, trialDays: event.target.value })}
            hint="Extiende la prueba desde hoy. Deja vacío para no modificar."
          />
          <div className="alert">
            <span>
              Todas estas acciones quedan registradas en la auditoría de la plataforma. No se eliminan datos al
              suspender una cuenta.
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}
