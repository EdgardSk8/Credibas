import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeDollarSign, Download, Eye, RefreshCcw, Search } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Field';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState, TableSkeleton } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { Modal } from '../../components/ui/Modal';
import { PaymentModal } from './PaymentModal';
import { api, buildQuery, errorMessage } from '../../lib/api';
import { dateShort, money } from '../../lib/format';
import { paymentMethod, paymentStatus } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useToast } from '../../components/ui/Toasts';
import { PERMISSIONS } from '@shared/rbac';
import type { Paginated, PaymentSummary } from '@shared/types';

interface PaymentDetailResponse {
  payment: PaymentSummary;
}

export function PaymentsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setNewOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const query = useQuery({
    queryKey: ['payments', debouncedSearch, method, status, from, to, page],
    queryFn: () =>
      api.get<Paginated<PaymentSummary>>(
        `/api/payments${buildQuery({
          search: debouncedSearch,
          method: method || undefined,
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize: 25,
        })}`,
      ),
  });

  const detailQuery = useQuery({
    queryKey: ['payment', detailId],
    queryFn: () => api.get<PaymentDetailResponse>(`/api/payments/${detailId}`),
    enabled: Boolean(detailId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['loan'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const reverse = async () => {
    if (!reverseId) return;
    if (reason.trim().length < 10) {
      toast.error('Describe el motivo (mínimo 10 caracteres).');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/payments/${reverseId}/reverse`, { reason: reason.trim() });
      toast.success('Pago revertido y auditado.');
      setReverseId(null);
      setReason('');
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const detailPayment = detailQuery.data?.payment;

  return (
    <>
      <PageHeader
        icon={<BadgeDollarSign size={16} />}
        title="Pagos"
        description="Cada cobro con su distribución, responsable y trazabilidad."
        actions={
          <>
            {hasPermission(PERMISSIONS.reportsExport) && (
              <Button
                variant="secondary"
                icon={<Download size={16} />}
                onClick={() => {
                  window.location.href = '/api/payments/export.csv';
                }}
              >
                Exportar CSV
              </Button>
            )}
            {hasPermission(PERMISSIONS.paymentsWrite) && (
              <Button variant="primary" icon={<BadgeDollarSign size={16} />} onClick={() => setNewOpen(true)}>
                Registrar pago
              </Button>
            )}
          </>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Search size={15} />
          <Input
            placeholder="Buscar por cliente, préstamo o referencia"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Buscar pagos"
          />
        </div>
        <select className="select" value={method} onChange={(event) => { setMethod(event.target.value); setPage(1); }} aria-label="Método">
          <option value="">Todos los métodos</option>
          <option value="cash">Efectivo</option>
          <option value="transfer">Transferencia</option>
          <option value="card">Tarjeta</option>
          <option value="other">Otro</option>
        </select>
        <select className="select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="confirmed">Confirmados</option>
          <option value="reversed">Revertidos</option>
        </select>
        <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} aria-label="Desde" />
        <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} aria-label="Hasta" />
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
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Préstamo</th>
                  <th className="text-right">Monto</th>
                  <th>Método</th>
                  <th>Registró</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((payment) => (
                  <tr key={payment.id}>
                    <td>{dateShort(payment.paidAt)}</td>
                    <td className="cell-strong">{payment.clientName}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {payment.loanCode}
                    </td>
                    <td className="text-right numeric cell-strong">{money(payment.amountCents, payment.currency)}</td>
                    <td>{paymentMethod[payment.method]}</td>
                    <td style={{ fontSize: 12 }}>{payment.createdByName ?? '—'}</td>
                    <td>
                      <StatusBadge map={paymentStatus} value={payment.status} />
                    </td>
                    <td className="cell-actions">
                      <div className="row" style={{ gap: '0.3rem', justifyContent: 'flex-end' }}>
                        <Button variant="ghost" size="sm" onClick={() => setDetailId(payment.id)}>
                          <Eye size={13} />
                          Detalle
                        </Button>
                        {payment.status === 'confirmed' && hasPermission(PERMISSIONS.paymentsReverse) && (
                          <Button variant="ghost" size="sm" onClick={() => setReverseId(payment.id)} aria-label="Revertir">
                            <RefreshCcw size={13} />
                          </Button>
                        )}
                      </div>
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
              itemLabel="pagos"
            />
          </>
        ) : (
          <EmptyState
            icon={<BadgeDollarSign size={20} />}
            title="Sin pagos con estos filtros"
            description="Registra un pago o ajusta el rango de fechas."
            action={
              hasPermission(PERMISSIONS.paymentsWrite) ? (
                <Button variant="primary" onClick={() => setNewOpen(true)}>
                  Registrar pago
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      <PaymentModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={refresh} />

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title="Detalle del pago"
        subtitle={detailPayment ? `${detailPayment.loanCode} · ${detailPayment.clientName}` : undefined}
        size="lg"
      >
        {detailQuery.isLoading || !detailPayment ? (
          <p className="field-hint">Cargando detalle…</p>
        ) : (
          <div className="stack">
            <div className="summary-strip" style={{ marginBottom: 0 }}>
              <div className="stat">
                <span className="stat-label">Monto</span>
                <span className="stat-value" style={{ fontSize: '1.1rem' }}>
                  {money(detailPayment.amountCents, detailPayment.currency)}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Método</span>
                <span className="stat-value" style={{ fontSize: '1.1rem' }}>
                  {paymentMethod[detailPayment.method]}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Fecha</span>
                <span className="stat-value" style={{ fontSize: '1.1rem' }}>
                  {dateShort(detailPayment.paidAt)}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Estado</span>
                <span className="stat-value" style={{ fontSize: '1.1rem' }}>
                  <StatusBadge map={paymentStatus} value={detailPayment.status} />
                </span>
              </div>
            </div>

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

            {detailPayment.notes && <p className="field-hint">Notas: {detailPayment.notes}</p>}
            {detailPayment.reference && <p className="field-hint">Referencia: {detailPayment.reference}</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(reverseId)}
        onClose={() => {
          setReverseId(null);
          setReason('');
        }}
        title="Revertir pago"
        subtitle="Se restará de las cuotas y quedará registrado en auditoría."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setReverseId(null);
                setReason('');
              }}
            >
              Cerrar
            </Button>
            <Button variant="danger" onClick={reverse} loading={saving}>
              Revertir
            </Button>
          </>
        }
      >
        <Textarea
          label="Motivo"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Pago duplicado, cheque sin fondos…"
        />
      </Modal>
    </>
  );
}
