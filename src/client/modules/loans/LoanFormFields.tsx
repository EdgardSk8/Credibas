import { Input, Select } from '../../components/ui/Field';
import type { LoanFormValues } from './loan-form';

interface LoanFormFieldsProps {
  values: LoanFormValues;
  onChange: (values: LoanFormValues) => void;
  errors?: Record<string, string>;
}

const methods = [
  { value: 'fixed_installment', label: 'Cuota fija (saldo insoluto)' },
  { value: 'flat_interest', label: 'Interés plano' },
  { value: 'declining_principal', label: 'Capital constante (saldo insoluto)' },
];

const frequencies = [
  { value: 'daily', label: 'Diaria' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'custom', label: 'Personalizada' },
];

export function LoanFormFields({ values, onChange, errors = {} }: LoanFormFieldsProps) {
  const patch = (partial: Partial<LoanFormValues>) => onChange({ ...values, ...partial });

  return (
    <div className="stack">
      <div className="field-grid">
        <Input
          label="Capital a prestar"
          required
          inputMode="decimal"
          value={values.principal}
          error={errors.principal}
          onChange={(event) => patch({ principal: event.target.value })}
          placeholder="50,000.00"
        />
        <Input
          label="Tasa de interés por período"
          required
          inputMode="decimal"
          value={values.ratePercent}
          error={errors.ratePercent}
          onChange={(event) => patch({ ratePercent: event.target.value })}
          suffix="%"
          hint="Ej. 5% mensual"
        />
      </div>

      <div className="field-grid">
        <Select
          label="Método de amortización"
          value={values.method}
          onChange={(event) => patch({ method: event.target.value as LoanFormValues['method'] })}
          options={methods}
        />
        <Select
          label="Frecuencia de pago"
          value={values.frequency}
          onChange={(event) => patch({ frequency: event.target.value as LoanFormValues['frequency'] })}
          options={frequencies}
        />
      </div>

      <div className="field-grid-3">
        <Input
          label="Número de cuotas"
          type="number"
          min={1}
          max={520}
          required
          value={values.installmentCount}
          error={errors.installmentCount}
          onChange={(event) => patch({ installmentCount: Number(event.target.value) || 1 })}
        />
        {values.frequency === 'custom' ? (
          <Input
            label="Cada cuántos días"
            type="number"
            min={1}
            max={365}
            required
            value={values.customDays}
            error={errors.customDays}
            onChange={(event) => patch({ customDays: Number(event.target.value) || 1 })}
          />
        ) : (
          <Input
            label="Comisión total"
            inputMode="decimal"
            value={values.fee}
            onChange={(event) => patch({ fee: event.target.value })}
            hint="Opcional, se reparte en las cuotas"
          />
        )}
        <Input
          label="Mora diaria"
          inputMode="decimal"
          value={(values.lateFeeDailyBps / 100).toFixed(2)}
          onChange={(event) =>
            patch({ lateFeeDailyBps: Math.round((Number.parseFloat(event.target.value.replace(',', '.')) || 0) * 100) })
          }
          suffix="%"
          hint="Sobre saldo vencido"
        />
      </div>

      <div className="field-grid-3">
        <Input
          label="Fecha de desembolso"
          type="date"
          required
          value={values.disbursementDate}
          error={errors.disbursementDate}
          onChange={(event) => patch({ disbursementDate: event.target.value })}
        />
        <Input
          label="Primer vencimiento"
          type="date"
          required
          value={values.firstDueDate}
          error={errors.firstDueDate}
          onChange={(event) => patch({ firstDueDate: event.target.value })}
        />
        <Input
          label="Días de gracia"
          type="number"
          min={0}
          max={120}
          value={values.graceDays}
          onChange={(event) => patch({ graceDays: Number(event.target.value) || 0 })}
        />
      </div>

      {values.frequency === 'custom' && (
        <Input
          label="Comisión total"
          inputMode="decimal"
          value={values.fee}
          onChange={(event) => patch({ fee: event.target.value })}
          hint="Opcional, se reparte en las cuotas"
        />
      )}
    </div>
  );
}
