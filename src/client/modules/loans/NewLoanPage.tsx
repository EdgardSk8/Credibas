import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Calculator, Check } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Select, Textarea } from '../../components/ui/Field';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { ScheduleTable } from '../../components/tables/ScheduleTable';
import { LoanFormFields } from './LoanFormFields';
import { buildLoanPayload, defaultLoanForm, previewLoan, type LoanFormValues } from './loan-form';
import { api, buildQuery, errorMessage } from '../../lib/api';
import { money, dateShort } from '../../lib/format';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';
import type { ClientSummary, Paginated } from '@shared/types';

export function NewLoanPage() {
  const { activeMembership } = useAuth();
  const currency = activeMembership?.currency ?? 'NIO';
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const preselectedClient = searchParams.get('clientId') ?? '';

  const [values, setValues] = useState<LoanFormValues>(() => defaultLoanForm(currency));
  const [clientId, setClientId] = useState(preselectedClient);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clientsQuery = useQuery({
    queryKey: ['clients-select'],
    queryFn: () => api.get<Paginated<ClientSummary>>(`/api/clients${buildQuery({ page: 1, pageSize: 100, status: 'active' })}`),
  });

  useEffect(() => {
    if (!preselectedClient && clientsQuery.data?.items.length === 1) {
      setClientId(clientsQuery.data.items[0]?.id ?? '');
    }
  }, [clientsQuery.data, preselectedClient]);

  const preview = useMemo(() => previewLoan(values), [values]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!clientId) nextErrors.clientId = 'Selecciona el cliente';
    if (!preview.schedule) nextErrors.principal = preview.error ?? 'Revisa los datos del préstamo';
    if (values.firstDueDate < values.disbursementDate) nextErrors.firstDueDate = 'No puede vencer antes del desembolso';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildLoanPayload(values, clientId, currency);
      const response = await api.post<{ loanId: string }>('/api/loans', payload);
      toast.success('Préstamo creado con su calendario de cuotas.');
      navigate(`/app/prestamos/${response.loanId}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (clientsQuery.isLoading) return <LoadingBlock label="Cargando clientes…" />;

  const clients = clientsQuery.data?.items ?? [];
  const selectedClient = clients.find((client) => client.id === clientId);

  return (
    <>
      <PageHeader
        eyebrow="Nuevo crédito"
        title="Crear préstamo"
        description="El calendario se calcula con el motor financiero de Credibas antes de guardar. Nada se desembolsa sin calendario verificable."
        actions={
          <Link to="/app/prestamos">
            <Button variant="ghost" icon={<ArrowLeft size={16} />}>
              Volver
            </Button>
          </Link>
        }
      />

      {clients.length === 0 ? (
        <div className="alert alert-warning">
          <AlertTriangle size={17} />
          <span>
            Necesitas registrar al menos un cliente activo antes de crear un préstamo.{' '}
            <Link to="/app/clientes?action=new" className="link">
              Registrar cliente
            </Link>
          </span>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="simulator" noValidate>
          <div className="dashboard-stack">
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Datos del préstamo</div>
                  <div className="card-subtitle">Moneda: {currency}</div>
                </div>
              </div>

              <div className="stack">
                <Select
                  label="Cliente"
                  required
                  value={clientId}
                  error={errors.clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  options={[
                    { value: '', label: 'Selecciona un cliente…' },
                    ...clients.map((client) => ({
                      value: client.id,
                      label: `${client.fullName} · ${client.code}`,
                    })),
                  ]}
                  hint={selectedClient ? `Saldo actual: ${money(selectedClient.stats?.outstandingCents ?? 0, currency)}` : undefined}
                />

                <LoanFormFields values={values} onChange={setValues} errors={errors} />

                <Textarea
                  label="Notas del préstamo"
                  value={values.notes}
                  onChange={(event) => setValues({ ...values, notes: event.target.value })}
                  placeholder="Destino del crédito, acuerdos especiales…"
                />
              </div>
            </section>

            <Button type="submit" variant="primary" size="lg" block loading={submitting} disabled={!preview.schedule}>
              <Check size={17} />
              Crear préstamo y generar calendario
            </Button>
          </div>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Vista previa del calendario</div>
                <div className="card-subtitle">
                  {preview.schedule
                    ? `${preview.schedule.installments.length} cuotas · primera el ${dateShort(preview.schedule.installments[0]?.dueDate ?? '')}`
                    : 'Completa los datos para ver el calendario'}
                </div>
              </div>
              <Calculator size={18} color="var(--accent)" />
            </div>

            {preview.error ? (
              <div className="alert alert-warning">
                <AlertTriangle size={16} />
                <span>{preview.error}</span>
              </div>
            ) : preview.schedule ? (
              <>
                <div className="simulator-totals">
                  <div className="stat">
                    <span className="stat-label">Capital</span>
                    <span className="stat-value" style={{ fontSize: '1.25rem' }}>
                      {money(preview.schedule.totalPrincipalCents, currency)}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Intereses</span>
                    <span className="stat-value" style={{ fontSize: '1.25rem' }}>
                      {money(preview.schedule.totalInterestCents, currency)}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Total a pagar</span>
                    <span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--accent)' }}>
                      {money(preview.schedule.totalToPayCents, currency)}
                    </span>
                  </div>
                </div>

                <ScheduleTable
                  compact
                  currency={currency}
                  installments={preview.schedule.installments.map((installment) => ({
                    id: String(installment.number),
                    number: installment.number,
                    dueDate: installment.dueDate,
                    principalCents: installment.principalCents,
                    interestCents: installment.interestCents,
                    feeCents: installment.feeCents,
                    totalCents: installment.totalCents,
                    status: 'pending' as const,
                    outstandingCents: installment.totalCents,
                    paidLateFeeCents: 0,
                  }))}
                />
              </>
            ) : null}
          </section>
        </form>
      )}
    </>
  );
}
