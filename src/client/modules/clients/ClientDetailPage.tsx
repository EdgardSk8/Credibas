import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  Upload,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { EmptyState, LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { ClientFormModal } from './ClientFormModal';
import { api, errorMessage } from '../../lib/api';
import { dateShort, money } from '../../lib/format';
import { clientStatus, loanStatus } from '../../lib/status';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';
import { PERMISSIONS } from '@shared/rbac';
import type { ClientSummary, LoanSummary } from '@shared/types';

interface ClientDetailResponse {
  client: ClientSummary;
  loans: LoanSummary[];
}

interface DocumentItem {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
}

export function ClientDetailPage() {
  const { clientId } = useParams();
  const { activeMembership, hasPermission } = useAuth();
  const currency = activeMembership?.currency ?? 'NIO';
  const queryClient = useQueryClient();
  const toast = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => api.get<ClientDetailResponse>(`/api/clients/${clientId}`),
    enabled: Boolean(clientId),
  });

  const documentsQuery = useQuery({
    queryKey: ['client-documents', clientId],
    queryFn: () => api.get<{ items: DocumentItem[] }>(`/api/clients/${clientId}/documents`),
    enabled: Boolean(clientId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  const onUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      await api.upload(`/api/clients/${clientId}/documents`, form);
      toast.success('Documento adjuntado.');
      await queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteDocument = async () => {
    if (!documentToDelete) return;
    try {
      await api.delete(`/api/clients/documents/${documentToDelete.id}`);
      toast.success('Documento eliminado.');
      setDocumentToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (query.isLoading) return <LoadingBlock label="Cargando ficha del cliente…" />;
  if (query.isError || !query.data) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(query.error)}</span>
      </div>
    );
  }

  const { client, loans } = query.data;
  const stats = client.stats;

  return (
    <>
      <PageHeader
        icon={<User size={16} />}
        eyebrow={client.code}
        title={client.fullName}
        description={client.identification ? `Identificación: ${client.identification}` : 'Sin identificación registrada'}
        actions={
          <>
            <Link to="/app/clientes">
              <Button variant="ghost" icon={<ArrowLeft size={16} />}>
                Volver
              </Button>
            </Link>
            {hasPermission(PERMISSIONS.clientsWrite) && (
              <Button variant="secondary" icon={<Pencil size={15} />} onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            )}
            {hasPermission(PERMISSIONS.loansWrite) && (
              <Link to={`/app/prestamos/nuevo?clientId=${client.id}`}>
                <Button variant="primary" icon={<Plus size={16} />}>
                  Nuevo préstamo
                </Button>
              </Link>
            )}
          </>
        }
      />

      <div className="summary-strip">
        <div className="stat">
          <span className="stat-label">Préstamos activos</span>
          <span className="stat-value">{stats?.activeLoans ?? 0}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Saldo pendiente</span>
          <span className="stat-value">{money(stats?.outstandingCents ?? 0, currency)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Saldo vencido</span>
          <span className="stat-value" style={{ color: (stats?.overdueCents ?? 0) > 0 ? 'var(--danger)' : undefined }}>
            {money(stats?.overdueCents ?? 0, currency)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Total pagado</span>
          <span className="stat-value">{money(stats?.totalPaidCents ?? 0, currency)}</span>
        </div>
      </div>

      <div className="detail-grid">
        <div className="dashboard-stack">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <Wallet size={13} />
                  </span>
                  Préstamos del cliente
                </div>
                <div className="card-subtitle">{loans.length} préstamo(s) registrado(s)</div>
              </div>
            </div>

            {loans.length === 0 ? (
              <EmptyState
                icon={<Wallet size={20} />}
                title="Sin préstamos"
                description="Este cliente todavía no tiene créditos registrados."
                action={
                  hasPermission(PERMISSIONS.loansWrite) ? (
                    <Link to={`/app/prestamos/nuevo?clientId=${client.id}`}>
                      <Button variant="primary" icon={<Plus size={16} />}>
                        Crear préstamo
                      </Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Préstamo</th>
                      <th>Desembolso</th>
                      <th className="text-right">Capital</th>
                      <th className="text-right">Pendiente</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan) => (
                      <tr key={loan.id}>
                        <td className="cell-strong">{loan.code}</td>
                        <td>{dateShort(loan.disbursementDate)}</td>
                        <td className="text-right numeric">{money(loan.principalCents, loan.currency)}</td>
                        <td className="text-right numeric">{money(loan.metrics.outstandingCents, loan.currency)}</td>
                        <td>
                          <StatusBadge map={loanStatus} value={loan.status} />
                        </td>
                        <td className="cell-actions">
                          <Link to={`/app/prestamos/${loan.id}`} className="btn btn-sm">
                            Ver
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <FileText size={13} />
                  </span>
                  Documentos
                </div>
                <div className="card-subtitle">Cédula, comprobantes y soportes (máx. 10 MB)</div>
              </div>
              {hasPermission(PERMISSIONS.clientsDocuments) && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    onChange={onUpload}
                    style={{ display: 'none' }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Upload size={14} />}
                    loading={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Adjuntar
                  </Button>
                </>
              )}
            </div>

            {(documentsQuery.data?.items.length ?? 0) === 0 ? (
              <p className="field-hint">Sin documentos adjuntos.</p>
            ) : (
              <div className="dash-list">
                {documentsQuery.data?.items.map((document) => (
                  <div key={document.id} className="dash-row">
                    <div className="dash-row-main">
                      <strong>{document.filename}</strong>
                      <span>
                        {(document.sizeBytes / 1024).toFixed(0)} KB · {dateShort(document.createdAt)}
                      </span>
                    </div>
                    <div className="row" style={{ gap: '0.35rem' }}>
                      <a href={document.downloadUrl} className="btn btn-sm">
                        <FileText size={13} />
                        Abrir
                      </a>
                      {hasPermission(PERMISSIONS.clientsDocuments) && (
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => setDocumentToDelete(document)}
                          aria-label="Eliminar documento"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="dashboard-stack">
          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-chip">
                  <User size={13} />
                </span>
                Contacto
              </div>
              <StatusBadge map={clientStatus} value={client.status} />
            </div>
            <div className="detail-meta">
              <div className="meta-row">
                <span>
                  <Phone size={13} /> Teléfono
                </span>
                <strong>{client.phone ?? '—'}</strong>
              </div>
              <div className="meta-row">
                <span>
                  <Mail size={13} /> Correo
                </span>
                <strong style={{ wordBreak: 'break-all' }}>{client.email ?? '—'}</strong>
              </div>
              <div className="meta-row" style={{ alignItems: 'flex-start' }}>
                <span>Dirección</span>
                <strong style={{ maxWidth: '60%' }}>{client.address ?? '—'}</strong>
              </div>
              <div className="meta-row">
                <span>
                  <CalendarClock size={13} /> Registrado
                </span>
                <strong>{dateShort(client.createdAt)}</strong>
              </div>
            </div>

            <div className="row" style={{ marginTop: 'var(--space-4)', gap: '0.4rem', flexWrap: 'wrap' }}>
              {client.phone && (
                <>
                  <a href={`tel:${client.phone}`} className="btn btn-sm">
                    <Phone size={13} />
                    Llamar
                  </a>
                  <a
                    href={`https://wa.me/${client.phone.replace(/[^\d]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm"
                  >
                    <MessageCircle size={13} />
                    WhatsApp
                  </a>
                </>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-chip">
                  <Users size={13} />
                </span>
                Referencias
              </div>
            </div>
            {client.references.length === 0 ? (
              <p className="field-hint">Sin referencias registradas.</p>
            ) : (
              <div className="detail-meta">
                {client.references.map((reference, index) => (
                  <div key={`${reference.name}-${index}`} className="meta-row">
                    <span>
                      {reference.name}
                      {reference.relationship ? ` · ${reference.relationship}` : ''}
                    </span>
                    <strong>{reference.phone ?? '—'}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <span className="icon-chip">
                  <StickyNote size={13} />
                </span>
                Notas internas
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>
              {client.notes || 'Sin notas.'}
            </p>
            <Badge tone="neutral" className="no-print" style={{ marginTop: 'var(--space-3)' }}>
              Visible solo para tu equipo
            </Badge>
          </section>
        </div>
      </div>

      <ClientFormModal open={editOpen} onClose={() => setEditOpen(false)} onSaved={refresh} client={client} />

      <Modal
        open={Boolean(documentToDelete)}
        onClose={() => setDocumentToDelete(null)}
        title="Eliminar documento"
        subtitle={documentToDelete?.filename}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDocumentToDelete(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={deleteDocument}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          El archivo se eliminará del almacenamiento. Esta acción no se puede deshacer.
        </p>
      </Modal>
    </>
  );
}
