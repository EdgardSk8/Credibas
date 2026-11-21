import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScheduleTable } from '../../components/tables/ScheduleTable';
import { LoanFormFields } from './LoanFormFields';
import { defaultLoanForm, previewLoan, type LoanFormValues } from './loan-form';
import { money } from '../../lib/format';
import { useAuth } from '../../hooks/useAuth';
import { formatMoney } from '@shared/finance/money';

export function SimulatorPage() {
  const { activeMembership } = useAuth();
  const currency = activeMembership?.currency ?? 'NIO';
  const [values, setValues] = useState<LoanFormValues>(() => defaultLoanForm(currency));
  const preview = useMemo(() => previewLoan(values), [values]);

  return (
    <>
      <PageHeader
        eyebrow="Herramienta"
        title="Simulador de crédito"
        description="Calcula cuotas, intereses y total a pagar antes de comprometer un desembolso. No guarda nada."
        actions={
          <span className="badge badge-accent">
            <Calculator size={13} />
            Cálculo local
          </span>
        }
      />

      <div className="simulator">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Parámetros</div>
              <div className="card-subtitle">Ajusta y observa el resultado al instante.</div>
            </div>
          </div>
          <LoanFormFields values={values} onChange={setValues} />
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Resultado</div>
              <div className="card-subtitle">
                {preview.schedule
                  ? `${preview.schedule.installments.length} cuotas · tasa por período ${(preview.schedule.periodicRateBps / 100).toFixed(2)}%`
                  : 'Ajusta los datos para calcular'}
              </div>
            </div>
          </div>

          {preview.error ? (
            <div className="alert alert-warning">
              <span>{preview.error}</span>
            </div>
          ) : preview.schedule ? (
            <>
              <div className="simulator-totals">
                <div className="stat">
                  <span className="stat-label">Capital</span>
                  <span className="stat-value" style={{ fontSize: '1.3rem' }}>
                    {money(preview.schedule.totalPrincipalCents, currency)}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Intereses</span>
                  <span className="stat-value" style={{ fontSize: '1.3rem' }}>
                    {money(preview.schedule.totalInterestCents, currency)}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Total a pagar</span>
                  <span className="stat-value" style={{ fontSize: '1.3rem', color: 'var(--accent)' }}>
                    {money(preview.schedule.totalToPayCents, currency)}
                  </span>
                </div>
              </div>

              <div className="row" style={{ gap: '1rem', marginBottom: 'var(--space-3)', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                <span>Cuota estimada: <strong style={{ color: 'var(--text)' }}>{money(preview.schedule.installments[0]?.totalCents ?? 0, currency)}</strong></span>
                <span>
                  Tasa anualizada aproximada:{' '}
                  <strong style={{ color: 'var(--text)' }}>{formatMoney(preview.schedule.annualizedRateBps / 100, 'USD', { withSymbol: false })}%</strong>
                </span>
                {preview.schedule.totalFeeCents > 0 && (
                  <span>
                    Comisión: <strong style={{ color: 'var(--text)' }}>{money(preview.schedule.totalFeeCents, currency)}</strong>
                  </span>
                )}
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
      </div>
    </>
  );
}
