import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Ban,
  Banknote,
  CalendarClock,
  Receipt,
  RefreshCcw,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { EmptyState, LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/Field';
import { ScheduleTable } from '../../components/tables/ScheduleTable';
import { PaymentModal } from '../payments/PaymentModal';
import { api, errorMessage } from '../../lib/api';
import { dateShort, money, percentFromBps } from '../../lib/format';
import { installmentStatus, loanStatus, methodLabel, frequencyLabel, paymentMethod, paymentStatus } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';
import { PERMISSIONS } from '@shared/rbac';
import type { InstallmentSummary, LoanSummary, PaymentSummary } from '@shared/types';

interface LoanDetailResponse {
  loan: LoanSummary;
  installments: InstallmentSummary[];
  payments: PaymentSummary[];
}

export function LoanDetailPage() {
  const { loanId } = useParams();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reversePaymentId, setReversePaymentId] = useState<string | null>(null);
  const [detailPayment, setDetailPayment] = useState<PaymentSummary | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const [adjustForm, setAdjustForm] = useState({ installmentCount: '', ratePercent: '', firstDueDate: '', reason: '' });

  const query = useQuery({
    queryKey: ['loan', loanId],
    queryFn: () => api.get<LoanDetailResponse>(`/api/loans/${loanId}`),
    enabled: Boolean(loanId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['loan', loanId] });
    void queryClient.invalidateQueries({ queryKey: ['loans'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const reversePayment = async () => {
    if (!reversePaymentId) return;
    if (reason.trim().length < 10) {
      toast.error('Describe el motivo de la reversión (mínimo 10 caracteres).');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/payments/${reversePaymentId}/reverse`, { reason: reason.trim() });
      toast.success('Pago revertido y registrado en auditoría.');
      setReversePaymentId(null);
      setReason('');
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const submitAdjust = async () => {
    if (adjustForm.reason.trim().length < 5) {
      toast.error('Explica el motivo de la reestructuración.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/loans/${loanId}/adjust`, {
        reason: adjustForm.reason.trim(),
        installmentCount: adjustForm.installmentCount ? Number(adjustForm.installmentCount) : undefined,
        interestRateBps: adjustForm.ratePercent
          ? Math.round(Number.parseFloat(adjustForm.ratePercent.replace(',', '.')) * 100)
          : undefined,
        firstDueDate: adjustForm.firstDueDate || undefined,
      });
      toast.success('Calendario reestructurado. El historial se conserva.');
      setAdjustOpen(false);
      setAdjustForm({ installmentCount: '', ratePercent: '', firstDueDate: '', reason: '' });
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const submitCancel = async () => {
    if (reason.trim().length < 5) {
      toast.error('Explica el motivo de la cancelación.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/loans/${loanId}/cancel`, { reason: reason.trim() });
      toast.success('Préstamo cancelado.');
      setCancelOpen(false);
      setReason('');
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading) return <LoadingBlock label="Cargando préstamo…" />;
  if (query.isError || !query.data) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(query.error)}</span>
      </div>
    );
  }

  const { loan, installments, payments } = query.data;
  const isActive = loan.status === 'active';
  const nextInstallment = installments.find((item) => ['pending', 'partial', 'overdue'].includes(item.status));

  return (
    <>
      <PageHeader
        eyebrow={loan.code}
        title={loan.clientName}
        description={`Desembolsado el ${dateShort(loan.disbursementDate)} · ${loan.installmentCount} cuotas ${frequencyLabel[loan.frequency]?.toLowerCase() ?? ''}`}
        actions={
          <>
            <Link to="/app/prestamos">
              <Button variant="ghost" icon={<ArrowLeft size={16} />}>
                Volver
              </Button>
            </Link>
            <Link to={`/app/clientes/${loan.clientId}`}>
              <Button variant="secondary">Ver cliente</Button>
            </Link>
            {isActive && hasPermission(PERMISSIONS.paymentsWrite) && (
              <Button
                variant="primary"
                icon={<Banknote size={16} />}
                onClick={() => setPaymentOpen(true)}
              >
                Registrar pago
              </Button>
            )}
          </>
        }
      />

      <div className="summary-strip">
        <div className="stat">
          <span className="stat-label">Capital</span>
          <span className="stat-value" style={{ fontSize: '1.2rem' }}>{money(loan.principalCents, loan.currency)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Total a pagar</span>
          <span className="stat-value" style={{ fontSize: '1.2rem' }}>{money(loan.totalToPayCents, loan.currency)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Pagado</span>
          <span className="stat-value" style={{ fontSize: '1.2rem' }}>{money(loan.metrics.paidCents, loan.currency)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Pendiente</span>
          <span className="stat-value" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>
            {money(loan.metrics.outstandingCents, loan.currency)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Vencido</span>
          <span className="stat-value" style={{ fontSize: '1.2rem', color: loan.metrics.overdueCents > 0 ? 'var(--danger)' : undefined }}>
            {money(loan.metrics.overdueCents, loan.currency)}
          </span>
        </div>
      </div>

      <div className="detail-grid">
        <div className="dashboard-stack">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Calendario de cuotas</div>
                <div className="card-subtitle">
                  Progreso {loan.metrics.progressPercent}% · {installments.filter((item) => item.status === 'paid').length} cuota(s) pagada(s)
                </div>
              </div>
              <StatusBadge map={loanStatus} value={loan.status} />
            </div>

            <div className="progress" style={{ marginBottom: 'var(--space-4)' }}>
              <span style={{ width: `${loan.metrics.progressPercent}%` }} />
            </div>

            <ScheduleTable currency={loan.currency} installments={installments} />
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Pagos registrados</div>
                <div className="card-subtitle">{payments.length} pago(s) · trazabilidad completa</div>
              </div>
              <Receipt size={18} color="var(--text-faint)" />
            </div>

            {payments.length === 0 ? (
              <EmptyState
                icon={<Receipt size={20} />}
                title="Sin pagos"
                description="Aún no se ha registrado ningún pago para este préstamo."
              />
            ) : (
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th className="text-right">Monto</th>
                      <th>Método</th>
                      <th>Registró</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{dateShort(payment.paidAt)}</td>
                        <td className="text-right numeric cell-strong">{money(payment.amountCents, payment.currency)}</td>
                        <td>{paymentMethod[payment.method] ?? payment.method}</td>
                        <td style={{ fontSize: 12 }}>{payment.createdByName ?? '—'}</td>
                        <td>
                          <StatusBadge map={paymentStatus} value={payment.status} />
                        </td>
                        <td className="cell-actions">
                          <div className="row" style={{ gap: '0.3rem', justifyContent: 'flex-end' }}>
                            <Button variant="ghost" size="sm" onClick={() => setDetailPayment(payment)}>
                              Detalle
                            </Button>
                            {payment.status === 'confirmed' && hasPermission(PERMISSIONS.paymentsReverse) && (
                              <Button variant="ghost" size="sm" onClick={() => setReversePaymentId(payment.id)}>
                                <RefreshCcw size={13} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="dashboard-stack">
          <section className="card">
            <div className="card-header">
              <div className="card-title">Condiciones</div>
            </div>
            <div className="detail-meta">
              <div className="meta-row">
                <span>Moneda</span>
                <strong>{loan.currency}</strong>
              </div>
              <div className="meta-row">
                <span>Tasa por período</span>
                <strong>{percentFromBps(loan.interestRateBps)}</strong>
              </div>
              <div className="meta-row">
                <span>Método</span>
                <strong>{methodLabel[loan.amortizationMethod]}</strong>
              </div>
              <div className="meta-row">
                <span>Frecuencia</span>
                <strong>
                  {frequencyLabel[loan.frequency]}
                  {loan.frequency === 'custom' && loan.customDays ? ` (${loan.customDays} días)` : ''}
                </strong>
              </div>
              <div className="meta-row">
                <span>Intereses</span>
                <strong>{money(loan.totalInterestCents, loan.currency)}</strong>
              </div>
              <div className="meta-row">
                <span>Comisión</span>
                <strong>{money(loan.totalFeeCents, loan.currency)}</strong>
              </div>
              <div className="meta-row">
                <span>Mora diaria</span>
                <strong>{percentFromBps(loan.lateFeeDailyBps)}</strong>
              </div>
              <div className="meta-row">
                <span>Días de gracia</span>
                <strong>{loan.graceDays}</strong>
              </div>
              <div className="meta-row">
                <span>Próximo vencimiento</span>
                <strong>{nextInstallment ? dateShort(nextInstallment.dueDate) : '—'}</strong>
              </div>
            </div>
          </section>

          {isActive && (
            <section className="card">
              <div className="card-header">
                <div className="card-title">Acciones</div>
              </div>
              <div className="stack" style={{ gap: '0.5rem' }}>
                {hasPermission(PERMISSIONS.loansAdjust) && (
                  <Button
                    variant="secondary"
                    block
                    icon={<ArrowRightLeft size={15} />}
                    onClick={() => {
                      setAdjustForm({
                        installmentCount: String(loan.installmentCount),
                        ratePercent: (loan.interestRateBps / 100).toFixed(2),
                        firstDueDate: nextInstallment?.dueDate ?? loan.firstDueDate,
                        reason: '',
                      });
                      setAdjustOpen(true);
                    }}
                  >
                    Reestructurar saldo
                  </Button>
                )}
                {hasPermission(PERMISSIONS.loansCancel) && (
                  <Button variant="danger" block icon={<Ban size={15} />} onClick={() => setCancelOpen(true)}>
                    Cancelar préstamo
                  </Button>
                )}
              </div>
              <p className="field-hint" style={{ marginTop: 'var(--space-3)' }}>
                La reestructuración genera una nueva versión del calendario sobre el saldo insoluto y conserva el
                historial de pagos.
              </p>
            </section>
          )}

          {loan.notes && (
            <section className="card">
              <div className="card-header">
                <div className="card-title">Notas</div>
              </div>
              <p className="text-muted" style={{ fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>
                {loan.notes}
              </p>
            </section>
          )}

          {loan.metrics.overdueCount > 0 && (
            <div className="alert alert-danger">
              <AlertTriangle size={17} />
              <span>
                {loan.metrics.overdueCount} cuota(s) vencida(s) por {money(loan.metrics.overdueCents, loan.currency)}. Revisa la
                agenda de cobros.
              </span>
            </div>
          )}
        </div>
      </div>

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSaved={refresh}
        loanId={loan.id}
        loanLabel={loan.code}
        suggestedAmountCents={nextInstallment?.outstandingCents}
      />

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Reestructurar saldo insoluto"
        subtitle={`Préstamo ${loan.code} · pendiente ${money(loan.metrics.outstandingCents, loan.currency)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjustOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submitAdjust} loading={saving}>
              Generar nueva versión
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="alert alert-warning">
            <AlertTriangle size={16} />
            <span>
              Se crearán nuevas cuotas para el saldo pendiente. Las cuotas impagas anteriores quedarán como
              reestructuradas; los pagos se conservan.
            </span>
          </div>
          <div className="field-grid-3">
            <Input
              label="Nuevas cuotas"
              type="number"
              min={1}
              value={adjustForm.installmentCount}
              onChange={(event) => setAdjustForm({ ...adjustForm, installmentCount: event.target.value })}
            />
            <Input
              label="Tasa por período"
              inputMode="decimal"
              suffix="%"
              value={adjustForm.ratePercent}
              onChange={(event) => setAdjustForm({ ...adjustForm, ratePercent: event.target.value })}
            />
            <Input
              label="Primer vencimiento"
              type="date"
              value={adjustForm.firstDueDate}
              onChange={(event) => setAdjustForm({ ...adjustForm, firstDueDate: event.target.value })}
            />
          </div>
          <Textarea
            label="Motivo"
            required
            value={adjustForm.reason}
            onChange={(event) => setAdjustForm({ ...adjustForm, reason: event.target.value })}
            placeholder="Cliente solicitó ampliar plazo por dificultades temporales…"
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(reversePaymentId)}
        onClose={() => {
          setReversePaymentId(null);
          setReason('');
        }}
        title="Revertir pago"
        subtitle="La reversión queda auditada con motivo y responsable."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setReversePaymentId(null);
                setReason('');
              }}
            >
              Cerrar
            </Button>
            <Button variant="danger" onClick={reversePayment} loading={saving}>
              Revertir pago
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="alert alert-danger">
            <AlertTriangle size={16} />
            <span>
              Se restarán los montos aplicados de las cuotas y el préstamo volverá a estado activo si estaba liquidado.
            </span>
          </div>
          <Textarea
            label="Motivo de la reversión"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Pago registrado por error / cheque sin fondos…"
          />
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
          setReason('');
        }}
        title="Cancelar préstamo"
        subtitle="Solo se permite si no tiene pagos confirmados."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCancelOpen(false);
                setReason('');
              }}
            >
              Cerrar
            </Button>
            <Button variant="danger" onClick={submitCancel} loading={saving}>
              Cancelar préstamo
            </Button>
          </>
        }
      >
        <div className="stack">
          <Textarea
            label="Motivo"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Préstamo otorgado por duplicado…"
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(detailPayment)}
        onClose={() => setDetailPayment(null)}
        title="Detalle del pago"
        subtitle={detailPayment ? `${detailPayment.loanCode} · ${detailPayment.clientName}` : undefined}
      >
        {detailPayment && (
          <div className="stack">
            <div className="detail-meta">
              <div className="meta-row">
                <span>Fecha</span>
                <strong>{dateShort(detailPayment.paidAt)}</strong>
              </div>
              <div className="meta-row">
                <span>Monto</span>
                <strong>{money(detailPayment.amountCents, detailPayment.currency)}</strong>
              </div>
              <div className="meta-row">
                <span>Método</span>
                <strong>{paymentMethod[detailPayment.method]}</strong>
              </div>
              <div className="meta-row">
                <span>Referencia</span>
                <strong>{detailPayment.reference ?? '—'}</strong>
              </div>
              <div className="meta-row">
                <span>Estado</span>
                <strong>
                  <StatusBadge map={paymentStatus} value={detailPayment.status} />
                </strong>
              </div>
            </div>

            {detailPayment.allocations.length === 0 ? (
              <p className="field-hint">
                Abre el pago desde la lista de Pagos para ver la distribución completa por cuota.
              </p>
            ) : (
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Cuota</th>
                      <th className="text-right">Mora</th>
                      <th className="text-right">Interés</th>
                      <th className="text-right">Capital</th>
                      <th className="text-right">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailPayment.allocations.map((allocation, index) => (
                      <tr key={`${allocation.installmentId}-${index}`}>
                        <td>#{allocation.installmentNumber || '—'}</td>
                        <td className="text-right numeric">{money(allocation.lateFeeCents, detailPayment.currency)}</td>
                        <td className="text-right numeric">{money(allocation.interestCents, detailPayment.currency)}</td>
                        <td className="text-right numeric">{money(allocation.principalCents, detailPayment.currency)}</td>
                        <td className="text-right numeric">{money(allocation.feeCents, detailPayment.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {installments.some((item) => item.status === 'overdue') && (
        <p className="field-hint" style={{ marginTop: 'var(--space-3)' }}>
          <CalendarClock size={12} style={{ display: 'inline', marginRight: 4 }} />
          Las cuotas vencidas acumulan mora diaria según las condiciones del préstamo.
        </p>
      )}

      <div className="no-print" style={{ marginTop: 'var(--space-4)' }}>
        <Badge tone="neutral">
          <Wallet size={12} /> {installmentStatus['paid']?.label}: {installments.filter((item) => item.status === 'paid').length}/
          {installments.length}
        </Badge>
      </div>
    </>
  );
}
