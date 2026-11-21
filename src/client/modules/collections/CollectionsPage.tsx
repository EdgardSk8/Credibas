import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ClipboardList, Phone, Plus, UserCheck } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { api, errorMessage } from '../../lib/api';
import { dateShort, money } from '../../lib/format';
import { collectionType } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';
import { PERMISSIONS } from '@shared/rbac';
import type { ClientSummary, CollectionAssignmentSummary, CollectionActivitySummary, LoanSummary, Paginated } from '@shared/types';

interface AgendaItem {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  loanId: string;
  loanCode: string;
  installmentId: string;
  dueDate: string;
  number: number;
  outstandingCents: number;
  currency: 'NIO' | 'USD';
  collectorName: string | null;
  overdue: boolean;
}

interface MemberItem {
  memberId: string;
  fullName: string;
  email: string;
  role: string;
  roleName: string;
  status: string;
}

type Tab = 'agenda' | 'assignments' | 'activities';

export function CollectionsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('agenda');
  const [days, setDays] = useState(15);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [assignmentForm, setAssignmentForm] = useState({ clientId: '', loanId: '', collectorMemberId: '', nextContactAt: '', notes: '' });
  const [activityForm, setActivityForm] = useState({
    clientId: '',
    loanId: '',
    type: 'call',
    outcome: '',
    notes: '',
    promiseAmount: '',
    promiseDate: '',
  });

  const agendaQuery = useQuery({
    queryKey: ['collection-agenda', days],
    queryFn: () => api.get<{ today: string; items: AgendaItem[] }>(`/api/collections/agenda?days=${days}`),
    enabled: tab === 'agenda',
  });

  const assignmentsQuery = useQuery({
    queryKey: ['collection-assignments'],
    queryFn: () => api.get<{ items: CollectionAssignmentSummary[] }>('/api/collections/assignments'),
    enabled: tab === 'assignments',
  });

  const activitiesQuery = useQuery({
    queryKey: ['collection-activities'],
    queryFn: () => api.get<{ items: CollectionActivitySummary[] }>('/api/collections/activities?limit=100'),
    enabled: tab === 'activities',
  });

  const clientsQuery = useQuery({
    queryKey: ['clients-select-collections'],
    queryFn: () => api.get<Paginated<ClientSummary>>('/api/clients?page=1&pageSize=100&status=active'),
    enabled: assignmentOpen || activityOpen,
  });

  const loansQuery = useQuery({
    queryKey: ['loans-select-collections'],
    queryFn: () => api.get<Paginated<LoanSummary>>('/api/loans?page=1&pageSize=100&status=active'),
    enabled: assignmentOpen || activityOpen,
  });

  const membersQuery = useQuery({
    queryKey: ['members-select'],
    queryFn: () => api.get<{ items: MemberItem[] }>('/api/organizations/members'),
    enabled: assignmentOpen,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['collection-agenda'] });
    void queryClient.invalidateQueries({ queryKey: ['collection-assignments'] });
    void queryClient.invalidateQueries({ queryKey: ['collection-activities'] });
  };

  const createAssignment = async () => {
    if (!assignmentForm.clientId || !assignmentForm.collectorMemberId) {
      toast.error('Selecciona cliente y cobrador.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/collections/assignments', {
        clientId: assignmentForm.clientId,
        loanId: assignmentForm.loanId || null,
        collectorMemberId: assignmentForm.collectorMemberId,
        nextContactAt: assignmentForm.nextContactAt || null,
        notes: assignmentForm.notes.trim() || null,
      });
      toast.success('Asignación creada.');
      setAssignmentOpen(false);
      setAssignmentForm({ clientId: '', loanId: '', collectorMemberId: '', nextContactAt: '', notes: '' });
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const createActivity = async () => {
    if (!activityForm.clientId) {
      toast.error('Selecciona el cliente.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/collections/activities', {
        clientId: activityForm.clientId,
        loanId: activityForm.loanId || null,
        type: activityForm.type,
        outcome: activityForm.outcome.trim() || null,
        notes: activityForm.notes.trim() || null,
        promiseAmountCents: activityForm.promiseAmount
          ? Math.round(Number.parseFloat(activityForm.promiseAmount.replace(',', '.')) * 100)
          : null,
        promiseDate: activityForm.promiseDate || null,
      });
      toast.success('Gestión registrada.');
      setActivityOpen(false);
      setActivityForm({ clientId: '', loanId: '', type: 'call', outcome: '', notes: '', promiseAmount: '', promiseDate: '' });
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Gestión de cobros"
        description="Agenda del día, asignaciones por cobrador y seguimiento de promesas."
        actions={
          <>
            {hasPermission(PERMISSIONS.collectionsWrite) && (
              <Button variant="secondary" icon={<ClipboardList size={16} />} onClick={() => setActivityOpen(true)}>
                Registrar gestión
              </Button>
            )}
            {hasPermission(PERMISSIONS.collectionsWrite) && (
              <Button variant="primary" icon={<UserCheck size={16} />} onClick={() => setAssignmentOpen(true)}>
                Asignar cobrador
              </Button>
            )}
          </>
        }
      />

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {[
            { key: 'agenda', label: 'Agenda' },
            { key: 'assignments', label: 'Asignaciones' },
            { key: 'activities', label: 'Gestiones' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key as Tab)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === 'agenda' && (
          <select className="select" value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Días">
            <option value={7}>Próximos 7 días</option>
            <option value={15}>Próximos 15 días</option>
            <option value={30}>Próximos 30 días</option>
          </select>
        )}
      </div>

      {tab === 'agenda' && (
        <section className="card">
          {agendaQuery.isLoading ? (
            <LoadingBlock />
          ) : (agendaQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<CalendarClock size={20} />}
              title="Agenda limpia"
              description="No hay cuotas vencidas ni próximas en el rango seleccionado."
            />
          ) : (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Préstamo</th>
                    <th>Cuota</th>
                    <th>Vence</th>
                    <th className="text-right">Pendiente</th>
                    <th>Cobrador</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {agendaQuery.data?.items.map((item) => (
                    <tr key={item.installmentId}>
                      <td className="cell-strong">{item.clientName}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{item.loanCode}</td>
                      <td className="numeric">#{String(item.number).padStart(2, '0')}</td>
                      <td>{dateShort(item.dueDate)}</td>
                      <td className="text-right numeric">{money(item.outstandingCents, item.currency)}</td>
                      <td style={{ fontSize: 12 }}>{item.collectorName ?? 'Sin asignar'}</td>
                      <td>
                        {item.overdue ? <Badge tone="danger" dot>Vencida</Badge> : <Badge tone="neutral" dot>Próxima</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'assignments' && (
        <section className="card">
          {assignmentsQuery.isLoading ? (
            <LoadingBlock />
          ) : (assignmentsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<UserCheck size={20} />}
              title="Sin asignaciones activas"
              description="Asigna clientes a un cobrador para dar seguimiento a su cartera."
              action={
                hasPermission(PERMISSIONS.collectionsWrite) ? (
                  <Button variant="primary" onClick={() => setAssignmentOpen(true)}>
                    Asignar cobrador
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Cobrador</th>
                    <th className="text-right">Vencido</th>
                    <th>Próximo contacto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentsQuery.data?.items.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>
                        <div style={{ display: 'grid' }}>
                          <strong style={{ fontSize: 13 }}>{assignment.clientName}</strong>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{assignment.loanCode ?? 'Sin préstamo'}</span>
                        </div>
                      </td>
                      <td>{assignment.collectorName}</td>
                      <td className="text-right numeric" style={{ color: assignment.overdueCents > 0 ? 'var(--danger)' : undefined }}>
                        {money(assignment.overdueCents)}
                      </td>
                      <td>{assignment.nextContactAt ? dateShort(assignment.nextContactAt) : '—'}</td>
                      <td>
                        <Badge tone={assignment.status === 'active' ? 'success' : 'neutral'}>{assignment.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'activities' && (
        <section className="card">
          {activitiesQuery.isLoading ? (
            <LoadingBlock />
          ) : (activitiesQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<ClipboardList size={20} />}
              title="Sin gestiones registradas"
              description="Registra llamadas, visitas y promesas de pago para tener trazabilidad del cobro."
              action={
                hasPermission(PERMISSIONS.collectionsWrite) ? (
                  <Button variant="primary" onClick={() => setActivityOpen(true)}>
                    Registrar gestión
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="dash-list">
              {activitiesQuery.data?.items.map((activity) => (
                <div key={activity.id} className="dash-row">
                  <div className="dash-row-main">
                    <strong>
                      {activity.clientName} · {collectionType[activity.type] ?? activity.type}
                    </strong>
                    <span>
                      {dateShort(activity.createdAt)}
                      {activity.createdByName ? ` · ${activity.createdByName}` : ''}
                      {activity.outcome ? ` · ${activity.outcome}` : ''}
                    </span>
                    {activity.notes && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activity.notes}</span>
                    )}
                  </div>
                  {activity.promiseAmountCents ? (
                    <div className="dash-row-amount">
                      {money(activity.promiseAmountCents)}
                      <small>Promesa {activity.promiseDate ? dateShort(activity.promiseDate) : ''}</small>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <Modal
        open={assignmentOpen}
        onClose={() => setAssignmentOpen(false)}
        title="Asignar cobrador"
        subtitle="El cobrador verá este cliente en su agenda."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignmentOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={createAssignment} loading={saving}>
              Asignar
            </Button>
          </>
        }
      >
        <div className="stack">
          <Select
            label="Cliente"
            required
            value={assignmentForm.clientId}
            onChange={(event) => setAssignmentForm({ ...assignmentForm, clientId: event.target.value })}
            options={[
              { value: '', label: 'Selecciona…' },
              ...(clientsQuery.data?.items ?? []).map((client) => ({ value: client.id, label: `${client.fullName} · ${client.code}` })),
            ]}
          />
          <Select
            label="Préstamo (opcional)"
            value={assignmentForm.loanId}
            onChange={(event) => setAssignmentForm({ ...assignmentForm, loanId: event.target.value })}
            options={[
              { value: '', label: 'Cartera completa del cliente' },
              ...(loansQuery.data?.items ?? []).map((loan) => ({
                value: loan.id,
                label: `${loan.code} · ${loan.clientName}`,
              })),
            ]}
          />
          <Select
            label="Cobrador"
            required
            value={assignmentForm.collectorMemberId}
            onChange={(event) => setAssignmentForm({ ...assignmentForm, collectorMemberId: event.target.value })}
            options={[
              { value: '', label: 'Selecciona…' },
              ...(membersQuery.data?.items ?? [])
                .filter((member) => member.status === 'active')
                .map((member) => ({ value: member.memberId, label: `${member.fullName} · ${member.roleName}` })),
            ]}
          />
          <Input
            label="Próximo contacto"
            type="date"
            value={assignmentForm.nextContactAt}
            onChange={(event) => setAssignmentForm({ ...assignmentForm, nextContactAt: event.target.value })}
          />
          <Textarea
            label="Notas"
            value={assignmentForm.notes}
            onChange={(event) => setAssignmentForm({ ...assignmentForm, notes: event.target.value })}
          />
        </div>
      </Modal>

      <Modal
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        title="Registrar gestión de cobro"
        subtitle="Llamada, visita, mensaje o promesa de pago."
        footer={
          <>
            <Button variant="ghost" onClick={() => setActivityOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={createActivity} loading={saving}>
              Guardar gestión
            </Button>
          </>
        }
      >
        <div className="stack">
          <Select
            label="Cliente"
            required
            value={activityForm.clientId}
            onChange={(event) => setActivityForm({ ...activityForm, clientId: event.target.value })}
            options={[
              { value: '', label: 'Selecciona…' },
              ...(clientsQuery.data?.items ?? []).map((client) => ({ value: client.id, label: `${client.fullName} · ${client.code}` })),
            ]}
          />
          <div className="field-grid">
            <Select
              label="Tipo"
              value={activityForm.type}
              onChange={(event) => setActivityForm({ ...activityForm, type: event.target.value })}
              options={[
                { value: 'call', label: 'Llamada' },
                { value: 'visit', label: 'Visita' },
                { value: 'message', label: 'Mensaje' },
                { value: 'promise', label: 'Promesa de pago' },
                { value: 'note', label: 'Nota' },
              ]}
            />
            <Input
              label="Resultado"
              value={activityForm.outcome}
              onChange={(event) => setActivityForm({ ...activityForm, outcome: event.target.value })}
              placeholder="No contesta / prometió pagar…"
            />
          </div>
          <Textarea
            label="Notas"
            value={activityForm.notes}
            onChange={(event) => setActivityForm({ ...activityForm, notes: event.target.value })}
          />
          {activityForm.type === 'promise' && (
            <div className="field-grid">
              <Input
                label="Monto prometido"
                inputMode="decimal"
                value={activityForm.promiseAmount}
                onChange={(event) => setActivityForm({ ...activityForm, promiseAmount: event.target.value })}
              />
              <Input
                label="Fecha prometida"
                type="date"
                value={activityForm.promiseDate}
                onChange={(event) => setActivityForm({ ...activityForm, promiseDate: event.target.value })}
              />
            </div>
          )}
          <div className="alert">
            <Phone size={15} />
            <span>La gestión queda asociada al cliente y visible para tu equipo.</span>
          </div>
        </div>
      </Modal>

      {hasPermission(PERMISSIONS.collectionsWrite) && (
        <div style={{ position: 'fixed', bottom: 20, right: 20 }} className="no-print">
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setActivityOpen(true)}>
            Gestión
          </Button>
        </div>
      )}
    </>
  );
}
