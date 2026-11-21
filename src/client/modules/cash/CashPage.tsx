import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Landmark, Lock, Plus, Unlock } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { api, errorMessage } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import { cashCategory } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';
import { PERMISSIONS } from '@shared/rbac';
import type { CashMovementSummary, CashRegisterSummary } from '@shared/types';

export function CashPage() {
  const { activeMembership, hasPermission } = useAuth();
  const currency = activeMembership?.currency ?? 'NIO';
  const queryClient = useQueryClient();
  const toast = useToast();

  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [movementModal, setMovementModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [openingForm, setOpeningForm] = useState({ openingBalance: '0.00', notes: '' });
  const [closingForm, setClosingForm] = useState({ countedBalance: '', notes: '' });
  const [movementForm, setMovementForm] = useState({ direction: 'in', category: 'otro', amount: '', description: '' });

  const currentQuery = useQuery({
    queryKey: ['cash-current'],
    queryFn: () => api.get<{ register: CashRegisterSummary | null }>('/api/cash/registers/current'),
  });

  const historyQuery = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<{ items: CashRegisterSummary[] }>('/api/cash/registers'),
  });

  const register = currentQuery.data?.register ?? null;

  const movementsQuery = useQuery({
    queryKey: ['cash-movements', register?.id],
    queryFn: () => api.get<{ items: CashMovementSummary[] }>(`/api/cash/registers/${register?.id}/movements`),
    enabled: Boolean(register?.id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['cash-current'] });
    void queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
    void queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
  };

  const openRegister = async () => {
    setSaving(true);
    try {
      await api.post('/api/cash/registers/open', {
        openingBalanceCents: Math.round(Number.parseFloat(openingForm.openingBalance.replace(',', '.')) * 100) || 0,
        notes: openingForm.notes.trim() || null,
      });
      toast.success('Caja abierta.');
      setOpenModal(false);
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const closeRegister = async () => {
    if (!register) return;
    const counted = Math.round(Number.parseFloat(closingForm.countedBalance.replace(',', '.')) * 100);
    if (!Number.isFinite(counted) || counted < 0) {
      toast.error('Ingresa el efectivo contado.');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post<{ differenceCents: number }>(`/api/cash/registers/${register.id}/close`, {
        countedBalanceCents: counted,
        notes: closingForm.notes.trim() || null,
      });
      toast.success(
        response.differenceCents === 0
          ? 'Caja cerrada sin diferencias.'
          : `Caja cerrada con diferencia de ${money(response.differenceCents, currency)}.`,
      );
      setCloseModal(false);
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const addMovement = async () => {
    if (!register) return;
    const cents = Math.round(Number.parseFloat(movementForm.amount.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error('Ingresa un monto válido.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/cash/registers/${register.id}/movements`, {
        direction: movementForm.direction,
        category: movementForm.category,
        amountCents: cents,
        description: movementForm.description.trim() || null,
      });
      toast.success('Movimiento registrado.');
      setMovementModal(false);
      setMovementForm({ direction: 'in', category: 'otro', amount: '', description: '' });
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (currentQuery.isLoading) return <LoadingBlock label="Cargando caja…" />;

  return (
    <>
      <PageHeader
        title="Caja"
        description="Controla el efectivo del día con apertura, movimientos y arqueo al cierre."
        actions={
          hasPermission(PERMISSIONS.cashClose) && (
            <>
              {!register ? (
                <Button variant="primary" icon={<Unlock size={16} />} onClick={() => setOpenModal(true)}>
                  Abrir caja
                </Button>
              ) : (
                <Button variant="secondary" icon={<Lock size={16} />} onClick={() => setCloseModal(true)}>
                  Cerrar caja
                </Button>
              )}
            </>
          )
        }
      />

      {!register ? (
        <section className="card">
          <EmptyState
            icon={<Landmark size={22} />}
            title="No hay caja abierta"
            description="Abre la caja al iniciar el día para registrar cobros en efectivo y egresos."
            action={
              hasPermission(PERMISSIONS.cashClose) ? (
                <Button variant="primary" onClick={() => setOpenModal(true)}>
                  Abrir caja
                </Button>
              ) : undefined
            }
          />
        </section>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi is-accent">
              <span className="kpi-label">Saldo en caja</span>
              <span className="kpi-value">{money(register.balanceCents, currency)}</span>
              <span className="kpi-meta">Apertura: {money(register.openingBalanceCents, currency)}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Ingresos</span>
              <span className="kpi-value" style={{ color: 'var(--accent)' }}>{money(register.incomeCents, currency)}</span>
              <span className="kpi-meta">
                <ArrowDownLeft size={13} /> Cobros y abonos
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Egresos</span>
              <span className="kpi-value" style={{ color: 'var(--danger)' }}>{money(register.expenseCents, currency)}</span>
              <span className="kpi-meta">
                <ArrowUpRight size={13} /> Desembolsos y gastos
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Abierta desde</span>
              <span className="kpi-value" style={{ fontSize: '1.1rem' }}>{dateTime(register.openedAt)}</span>
              <span className="kpi-meta">{register.openedByName}</span>
            </div>
          </div>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Movimientos de la caja</div>
                <div className="card-subtitle">Cada cobro y desembolso queda vinculado a su operación.</div>
              </div>
              {hasPermission(PERMISSIONS.cashWrite) && (
                <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setMovementModal(true)}>
                  Movimiento manual
                </Button>
              )}
            </div>

            {movementsQuery.isLoading ? (
              <LoadingBlock />
            ) : (movementsQuery.data?.items.length ?? 0) === 0 ? (
              <p className="field-hint">Sin movimientos todavía.</p>
            ) : (
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Tipo</th>
                      <th>Categoría</th>
                      <th>Descripción</th>
                      <th className="text-right">Monto</th>
                      <th>Registró</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movementsQuery.data?.items.map((movement) => (
                      <tr key={movement.id}>
                        <td>{dateTime(movement.createdAt)}</td>
                        <td>
                          <Badge tone={movement.direction === 'in' ? 'success' : 'danger'} dot>
                            {movement.direction === 'in' ? 'Ingreso' : 'Egreso'}
                          </Badge>
                        </td>
                        <td>{cashCategory[movement.category] ?? movement.category}</td>
                        <td style={{ fontSize: 12 }}>{movement.description ?? '—'}</td>
                        <td className="text-right numeric" style={{ color: movement.direction === 'in' ? 'var(--accent)' : 'var(--danger)' }}>
                          {movement.direction === 'in' ? '+' : '−'} {money(movement.amountCents, movement.currency)}
                        </td>
                        <td style={{ fontSize: 12 }}>{movement.createdByName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div className="card-header">
          <div className="card-title">Historial de cajas</div>
        </div>
        {(historyQuery.data?.items.length ?? 0) === 0 ? (
          <p className="field-hint">Aún no hay cajas registradas.</p>
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th className="text-right">Apertura</th>
                  <th className="text-right">Esperado</th>
                  <th className="text-right">Contado</th>
                  <th className="text-right">Diferencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historyQuery.data?.items.map((item) => (
                  <tr key={item.id}>
                    <td>{dateTime(item.openedAt)}</td>
                    <td>{item.closedAt ? dateTime(item.closedAt) : '—'}</td>
                    <td className="text-right numeric">{money(item.openingBalanceCents, currency)}</td>
                    <td className="text-right numeric">
                      {item.expectedBalanceCents !== null ? money(item.expectedBalanceCents, currency) : '—'}
                    </td>
                    <td className="text-right numeric">
                      {item.countedBalanceCents !== null ? money(item.countedBalanceCents, currency) : '—'}
                    </td>
                    <td
                      className="text-right numeric"
                      style={{ color: (item.differenceCents ?? 0) !== 0 ? 'var(--danger)' : undefined }}
                    >
                      {item.differenceCents !== null ? money(item.differenceCents, currency) : '—'}
                    </td>
                    <td>
                      <Badge tone={item.status === 'open' ? 'accent' : 'neutral'}>{item.status === 'open' ? 'Abierta' : 'Cerrada'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Abrir caja"
        subtitle="Registra el efectivo inicial con el que empiezas el día."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={openRegister} loading={saving}>
              Abrir caja
            </Button>
          </>
        }
      >
        <div className="stack">
          <Input
            label="Saldo inicial"
            inputMode="decimal"
            value={openingForm.openingBalance}
            onChange={(event) => setOpeningForm({ ...openingForm, openingBalance: event.target.value })}
            suffix={currency}
          />
          <Textarea
            label="Notas"
            value={openingForm.notes}
            onChange={(event) => setOpeningForm({ ...openingForm, notes: event.target.value })}
          />
        </div>
      </Modal>

      <Modal
        open={closeModal}
        onClose={() => setCloseModal(false)}
        title="Cerrar caja y arquear"
        subtitle={register ? `Saldo esperado: ${money(register.balanceCents, currency)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseModal(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={closeRegister} loading={saving}>
              Cerrar caja
            </Button>
          </>
        }
      >
        <div className="stack">
          <Input
            label="Efectivo contado"
            inputMode="decimal"
            value={closingForm.countedBalance}
            onChange={(event) => setClosingForm({ ...closingForm, countedBalance: event.target.value })}
            suffix={currency}
            hint="Cuenta el efectivo físico antes de cerrar."
          />
          <Textarea
            label="Notas del arqueo"
            value={closingForm.notes}
            onChange={(event) => setClosingForm({ ...closingForm, notes: event.target.value })}
            placeholder="Diferencias, faltantes o sobrantes…"
          />
        </div>
      </Modal>

      <Modal
        open={movementModal}
        onClose={() => setMovementModal(false)}
        title="Movimiento manual"
        subtitle="Para gastos o ajustes que no provienen de un pago."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMovementModal(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={addMovement} loading={saving}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="field-grid">
            <Select
              label="Tipo"
              value={movementForm.direction}
              onChange={(event) => setMovementForm({ ...movementForm, direction: event.target.value })}
              options={[
                { value: 'in', label: 'Ingreso' },
                { value: 'out', label: 'Egreso' },
              ]}
            />
            <Select
              label="Categoría"
              value={movementForm.category}
              onChange={(event) => setMovementForm({ ...movementForm, category: event.target.value })}
              options={[
                { value: 'gasto', label: 'Gasto' },
                { value: 'ajuste', label: 'Ajuste' },
                { value: 'otro', label: 'Otro' },
                { value: 'capital', label: 'Capital' },
                { value: 'interes', label: 'Interés' },
                { value: 'mora', label: 'Mora' },
              ]}
            />
          </div>
          <Input
            label="Monto"
            inputMode="decimal"
            value={movementForm.amount}
            onChange={(event) => setMovementForm({ ...movementForm, amount: event.target.value })}
            suffix={currency}
          />
          <Textarea
            label="Descripción"
            value={movementForm.description}
            onChange={(event) => setMovementForm({ ...movementForm, description: event.target.value })}
          />
        </div>
      </Modal>
    </>
  );
}
