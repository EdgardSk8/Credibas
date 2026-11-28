import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Field';
import { api, errorMessage } from '../../lib/api';
import { dateShort, money } from '../../lib/format';
import { useToast } from '../../components/ui/Toasts';

interface AdminPlanRequest {
  id: string;
  orgName: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  amountCents: number;
  currency: string;
  requestedBy: string;
  createdAt: string;
  note: string | null;
}

export function AdminRequestsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<AdminPlanRequest | null>(null);
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin-subscription-requests'],
    queryFn: () => api.get<{ items: AdminPlanRequest[] }>('/api/admin/subscription-requests'),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-subscription-requests'] });

  const approve = async (request: AdminPlanRequest) => {
    setBusyId(request.id);
    try {
      await api.post(`/api/admin/subscription-requests/${request.id}/approve`);
      toast.success(`Plan ${request.planName} activado para ${request.orgName}.`);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await api.post(`/api/admin/subscription-requests/${rejecting.id}/reject`, { note: note.trim() || undefined });
      toast.success('Solicitud rechazada.');
      setRejecting(null);
      setNote('');
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  if (query.isLoading) return <LoadingBlock label="Cargando solicitudes…" />;
  if (query.isError) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(query.error)}</span>
      </div>
    );
  }

  const items = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        icon={<Inbox size={16} />}
        title="Solicitudes de plan"
        description="Verifica el pago antes de aprobar el cambio de plan."
      />

      <section className="card">
        {items.length === 0 ? (
          <p className="field-hint">No hay solicitudes pendientes.</p>
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Organización</th>
                  <th>Plan</th>
                  <th>Ciclo</th>
                  <th className="text-right">Monto</th>
                  <th>Solicitado por</th>
                  <th>Fecha</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((request) => (
                  <tr key={request.id}>
                    <td className="cell-strong">{request.orgName}</td>
                    <td>{request.planName}</td>
                    <td>{request.billingCycle === 'yearly' ? 'Anual' : 'Mensual'}</td>
                    <td className="text-right numeric">{money(request.amountCents, request.currency as 'NIO' | 'USD')}</td>
                    <td>{request.requestedBy}</td>
                    <td>{dateShort(request.createdAt)}</td>
                    <td className="cell-actions">
                      <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                        <Button
                          size="sm"
                          variant="primary"
                          loading={busyId === request.id}
                          onClick={() => approve(request)}
                        >
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === request.id}
                          onClick={() => {
                            setRejecting(request);
                            setNote('');
                          }}
                        >
                          Rechazar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Rechazar solicitud"
        subtitle={rejecting ? `${rejecting.orgName} · ${rejecting.planName}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={busyId === rejecting?.id} onClick={reject}>
              Rechazar
            </Button>
          </>
        }
      >
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          El negocio verá la solicitud rechazada y podrá enviar otra cuando regularice el pago.
        </p>
        <Textarea
          label="Motivo (opcional)"
          placeholder="Ej. el comprobante no coincide con el monto"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      </Modal>
    </>
  );
}
