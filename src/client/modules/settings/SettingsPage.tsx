import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Plus, Settings2, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input, Select } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { api, errorMessage } from '../../lib/api';
import { dateTime, relativeTime } from '../../lib/format';
import { roleLabel } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';
import { PERMISSIONS } from '@shared/rbac';

interface OrgResponse {
  organization: {
    id: string;
    name: string;
    slug: string;
    currency: 'NIO' | 'USD';
    timezone: string;
    dateFormat: string;
    status: string;
  } | null;
  preferences: {
    defaultLateFeeDailyBps?: number;
    defaultGraceDays?: number;
    allocationOrder?: string[];
    paymentMethods?: string[];
    reminderDaysBeforeDue?: number;
  } | null;
  role: string;
  permissions: string[];
  limits: { planKey: string; limits: Record<string, number>; usage: Record<string, number> };
}

interface MemberItem {
  memberId: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  roleName: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

interface MembersResponse {
  items: MemberItem[];
  invitations: Array<{ id: string; email: string; roleName: string; createdAt: string; expiresAt: string }>;
  roles: Array<{ id: string; key: string; name: string; description: string | null; isSystem: number }>;
  usage: { members: number; clients: number; activeLoans: number; collectors: number; storageBytes: number };
}

interface AuditResponse {
  items: Array<{ id: string; action: string; entityType: string; entityId: string | null; actorName: string | null; createdAt: string }>;
  page: number;
  totalPages: number;
  total: number;
}

type Tab = 'business' | 'team' | 'audit';

const timezones = [
  'America/Managua',
  'America/Guatemala',
  'America/Tegucigalpa',
  'America/El_Salvador',
  'America/Costa_Rica',
  'America/Panama',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
];

const allocationPresets = [
  { value: 'late_fee,interest,principal,fee', label: 'Mora → Interés → Capital → Comisión' },
  { value: 'interest,principal,fee,late_fee', label: 'Interés → Capital → Comisión → Mora' },
  { value: 'principal,interest,fee,late_fee', label: 'Capital → Interés → Comisión → Mora' },
];

export function SettingsPage() {
  const { hasPermission, refresh } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('business');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [businessForm, setBusinessForm] = useState({
    name: '',
    currency: 'NIO',
    timezone: 'America/Managua',
    dateFormat: 'dd/MM/yyyy',
    defaultLateFeeDailyBps: 50,
    defaultGraceDays: 0,
    allocationOrder: 'late_fee,interest,principal,fee',
    paymentMethods: ['cash', 'transfer'] as string[],
    reminderDaysBeforeDue: 2,
  });

  const [inviteForm, setInviteForm] = useState({ email: '', roleKey: 'collector' });
  const [memberToRemove, setMemberToRemove] = useState<MemberItem | null>(null);

  const orgQuery = useQuery({
    queryKey: ['org-current'],
    queryFn: () => api.get<OrgResponse>('/api/organizations/current'),
  });

  const membersQuery = useQuery({
    queryKey: ['org-members'],
    queryFn: () => api.get<MembersResponse>('/api/organizations/members'),
    enabled: tab === 'team' && hasPermission(PERMISSIONS.membersRead),
  });

  const auditQuery = useQuery({
    queryKey: ['org-audit'],
    queryFn: () => api.get<AuditResponse>('/api/organizations/audit?page=1&pageSize=40'),
    enabled: tab === 'audit' && hasPermission(PERMISSIONS.auditRead),
  });

  useEffect(() => {
    const data = orgQuery.data;
    if (!data?.organization) return;
    setBusinessForm({
      name: data.organization.name,
      currency: data.organization.currency,
      timezone: data.organization.timezone,
      dateFormat: data.organization.dateFormat,
      defaultLateFeeDailyBps: data.preferences?.defaultLateFeeDailyBps ?? 50,
      defaultGraceDays: data.preferences?.defaultGraceDays ?? 0,
      allocationOrder: (data.preferences?.allocationOrder ?? ['late_fee', 'interest', 'principal', 'fee']).join(','),
      paymentMethods: data.preferences?.paymentMethods ?? ['cash', 'transfer'],
      reminderDaysBeforeDue: data.preferences?.reminderDaysBeforeDue ?? 2,
    });
  }, [orgQuery.data]);

  const saveBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch('/api/organizations/current', {
        name: businessForm.name.trim(),
        currency: businessForm.currency,
        timezone: businessForm.timezone,
        dateFormat: businessForm.dateFormat,
        defaultLateFeeDailyBps: Math.round(businessForm.defaultLateFeeDailyBps),
        defaultGraceDays: businessForm.defaultGraceDays,
        allocationOrder: businessForm.allocationOrder.split(','),
        paymentMethods: businessForm.paymentMethods,
        reminderDaysBeforeDue: businessForm.reminderDaysBeforeDue,
      });
      toast.success('Configuración guardada.');
      await queryClient.invalidateQueries({ queryKey: ['org-current'] });
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const invite = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email)) {
      toast.error('Ingresa un correo válido.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/organizations/members/invite', {
        email: inviteForm.email.trim().toLowerCase(),
        roleKey: inviteForm.roleKey,
      });
      toast.success('Invitación enviada.');
      setInviteOpen(false);
      setInviteForm({ email: '', roleKey: 'collector' });
      await queryClient.invalidateQueries({ queryKey: ['org-members'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (member: MemberItem, roleKey: string) => {
    try {
      await api.patch(`/api/organizations/members/${member.memberId}`, { roleKey });
      toast.success('Rol actualizado.');
      await queryClient.invalidateQueries({ queryKey: ['org-members'] });
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const removeMember = async () => {
    if (!memberToRemove) return;
    setSaving(true);
    try {
      await api.delete(`/api/organizations/members/${memberToRemove.memberId}`);
      toast.success('Miembro removido.');
      setMemberToRemove(null);
      await queryClient.invalidateQueries({ queryKey: ['org-members'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (orgQuery.isLoading) return <LoadingBlock label="Cargando configuración…" />;
  if (orgQuery.isError || !orgQuery.data?.organization) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(orgQuery.error)}</span>
      </div>
    );
  }

  const org = orgQuery.data.organization;

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Datos del negocio, políticas de cobro y equipo de trabajo."
        actions={
          <Badge tone="accent">
            <ShieldCheck size={13} />
            Plan {orgQuery.data.limits.planKey}
          </Badge>
        }
      />

      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" className="tab" aria-selected={tab === 'business'} onClick={() => setTab('business')}>
            Negocio
          </button>
          {hasPermission(PERMISSIONS.membersRead) && (
            <button type="button" role="tab" className="tab" aria-selected={tab === 'team'} onClick={() => setTab('team')}>
              Equipo
            </button>
          )}
          {hasPermission(PERMISSIONS.auditRead) && (
            <button type="button" role="tab" className="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>
              Auditoría
            </button>
          )}
        </div>
      </div>

      {tab === 'business' && (
        <form className="detail-grid" onSubmit={saveBusiness}>
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <Settings2 size={15} style={{ display: 'inline', marginRight: 6 }} />
                  Datos del negocio
                </div>
                <div className="card-subtitle">Identificador: {org.slug}</div>
              </div>
            </div>

            <div className="stack">
              <Input
                label="Nombre del negocio"
                value={businessForm.name}
                onChange={(event) => setBusinessForm({ ...businessForm, name: event.target.value })}
                required
              />
              <div className="field-grid">
                <Select
                  label="Moneda principal"
                  value={businessForm.currency}
                  onChange={(event) => setBusinessForm({ ...businessForm, currency: event.target.value })}
                  options={[
                    { value: 'NIO', label: 'Córdoba (NIO)' },
                    { value: 'USD', label: 'Dólar (USD)' },
                  ]}
                  hint="Los reportes nunca suman monedas distintas."
                />
                <Select
                  label="Zona horaria"
                  value={businessForm.timezone}
                  onChange={(event) => setBusinessForm({ ...businessForm, timezone: event.target.value })}
                  options={timezones.map((zone) => ({ value: zone, label: zone.replace('America/', '') }))}
                />
              </div>
              <Select
                label="Formato de fecha"
                value={businessForm.dateFormat}
                onChange={(event) => setBusinessForm({ ...businessForm, dateFormat: event.target.value })}
                options={[
                  { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy' },
                  { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy' },
                  { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd' },
                ]}
              />
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Políticas de cobro</div>
                <div className="card-subtitle">Valores por defecto para nuevos préstamos.</div>
              </div>
            </div>

            <div className="stack">
              <div className="field-grid">
                <Input
                  label="Mora diaria por defecto"
                  inputMode="decimal"
                  suffix="%"
                  value={(businessForm.defaultLateFeeDailyBps / 100).toFixed(2)}
                  onChange={(event) =>
                    setBusinessForm({
                      ...businessForm,
                      defaultLateFeeDailyBps: Math.round((Number.parseFloat(event.target.value.replace(',', '.')) || 0) * 100),
                    })
                  }
                />
                <Input
                  label="Días de gracia"
                  type="number"
                  min={0}
                  max={120}
                  value={businessForm.defaultGraceDays}
                  onChange={(event) => setBusinessForm({ ...businessForm, defaultGraceDays: Number(event.target.value) || 0 })}
                />
              </div>

              <Select
                label="Orden de aplicación de pagos"
                value={businessForm.allocationOrder}
                onChange={(event) => setBusinessForm({ ...businessForm, allocationOrder: event.target.value })}
                options={allocationPresets}
                hint="Afecta cómo se distribuye cada pago entre los componentes de la cuota."
              />

              <div className="field">
                <span className="field-label">Métodos de pago habilitados</span>
                <div className="row" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                  {[
                    { value: 'cash', label: 'Efectivo' },
                    { value: 'transfer', label: 'Transferencia' },
                    { value: 'card', label: 'Tarjeta' },
                    { value: 'other', label: 'Otro' },
                  ].map((method) => (
                    <Checkbox
                      key={method.value}
                      label={method.label}
                      checked={businessForm.paymentMethods.includes(method.value)}
                      onChange={(event) =>
                        setBusinessForm({
                          ...businessForm,
                          paymentMethods: event.target.checked
                            ? [...businessForm.paymentMethods, method.value]
                            : businessForm.paymentMethods.filter((item) => item !== method.value),
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <Button type="submit" variant="primary" loading={saving} disabled={!hasPermission(PERMISSIONS.orgSettings)}>
                Guardar configuración
              </Button>
            </div>
          </section>
        </form>
      )}

      {tab === 'team' && (
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <Users size={15} style={{ display: 'inline', marginRight: 6 }} />
                Equipo
              </div>
              <div className="card-subtitle">
                {membersQuery.data?.usage.members ?? 0} miembro(s) · límite del plan{' '}
                {orgQuery.data.limits.limits.users ?? '—'}
              </div>
            </div>
            {hasPermission(PERMISSIONS.membersInvite) && (
              <Button variant="primary" size="sm" icon={<UserPlus size={14} />} onClick={() => setInviteOpen(true)}>
                Invitar
              </Button>
            )}
          </div>

          {membersQuery.isLoading ? (
            <LoadingBlock />
          ) : (membersQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState icon={<Users size={20} />} title="Sin miembros" description="Invita a tu equipo para colaborar." />
          ) : (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Miembro</th>
                    <th>Rol</th>
                    <th>Último acceso</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {membersQuery.data?.items.map((member) => (
                    <tr key={member.memberId}>
                      <td>
                        <div style={{ display: 'grid' }}>
                          <strong style={{ fontSize: 13 }}>{member.fullName}</strong>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{member.email}</span>
                        </div>
                      </td>
                      <td>
                        {hasPermission(PERMISSIONS.membersUpdate) && member.role !== 'owner' ? (
                          <select
                            className="select"
                            value={member.role}
                            onChange={(event) => changeRole(member, event.target.value)}
                            style={{ minHeight: 30, padding: '0.2rem 0.5rem', width: 150 }}
                          >
                            {['admin', 'supervisor', 'collector', 'viewer'].map((role) => (
                              <option key={role} value={role}>
                                {roleLabel[role]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge tone={member.role === 'owner' ? 'accent' : 'neutral'}>{member.roleName}</Badge>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>{member.lastLoginAt ? relativeTime(member.lastLoginAt) : 'Nunca'}</td>
                      <td>
                        <Badge tone={member.status === 'active' ? 'success' : 'neutral'}>{member.status}</Badge>
                      </td>
                      <td className="cell-actions">
                        {hasPermission(PERMISSIONS.membersRemove) && member.role !== 'owner' && (
                          <Button variant="ghost" size="sm" onClick={() => setMemberToRemove(member)} aria-label="Remover">
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(membersQuery.data?.invitations.length ?? 0) > 0 && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <div className="sidebar-section" style={{ padding: 0 }}>
                Invitaciones pendientes
              </div>
              <div className="dash-list">
                {membersQuery.data?.invitations.map((invitation) => (
                  <div key={invitation.id} className="dash-row">
                    <div className="dash-row-main">
                      <strong>{invitation.email}</strong>
                      <span>
                        {invitation.roleName} · expira {dateTime(invitation.expiresAt)}
                      </span>
                    </div>
                    <Badge tone="warning">Pendiente</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'audit' && (
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <History size={15} style={{ display: 'inline', marginRight: 6 }} />
                Registro de auditoría
              </div>
              <div className="card-subtitle">Quién hizo qué y cuándo.</div>
            </div>
          </div>

          {auditQuery.isLoading ? (
            <LoadingBlock />
          ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState icon={<History size={20} />} title="Sin registros" description="Las acciones importantes aparecerán aquí." />
          ) : (
            <div className="dash-list">
              {auditQuery.data?.items.map((entry) => (
                <div key={entry.id} className="dash-row">
                  <div className="dash-row-main">
                    <strong>{entry.action}</strong>
                    <span>
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 12)}…` : ''}
                      {entry.actorName ? ` · ${entry.actorName}` : ''}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{dateTime(entry.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invitar colaborador"
        subtitle="Recibirá un correo con un enlace de un solo uso."
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={invite} loading={saving} icon={<Plus size={15} />}>
              Enviar invitación
            </Button>
          </>
        }
      >
        <div className="stack">
          <Input
            label="Correo"
            type="email"
            required
            value={inviteForm.email}
            onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })}
            placeholder="colaborador@correo.com"
          />
          <Select
            label="Rol"
            value={inviteForm.roleKey}
            onChange={(event) => setInviteForm({ ...inviteForm, roleKey: event.target.value })}
            options={[
              { value: 'admin', label: 'Administrador' },
              { value: 'supervisor', label: 'Supervisor' },
              { value: 'collector', label: 'Cobrador' },
              { value: 'viewer', label: 'Consulta' },
            ]}
          />
          <div className="alert">
            <ShieldCheck size={15} />
            <span>El rol define exactamente qué puede ver y hacer dentro del negocio.</span>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        title="Remover miembro"
        subtitle={memberToRemove?.fullName}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMemberToRemove(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={removeMember} loading={saving}>
              Remover
            </Button>
          </>
        }
      >
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          El miembro perderá acceso a este negocio. Sus registros históricos se conservan.
        </p>
      </Modal>
    </>
  );
}
