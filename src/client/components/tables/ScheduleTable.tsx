import type { InstallmentSummary } from '@shared/types';
import type { Currency } from '@shared/finance/types';
import { money, dateShort } from '../../lib/format';
import { StatusBadge } from '../ui/Badge';
import { installmentStatus } from '../../lib/status';

interface ScheduleTableProps {
  installments: Array<
    Pick<InstallmentSummary, 'id' | 'number' | 'dueDate' | 'principalCents' | 'interestCents' | 'feeCents' | 'totalCents' | 'status' | 'outstandingCents' | 'paidLateFeeCents'>
  >;
  currency: Currency;
  compact?: boolean;
}

export function ScheduleTable({ installments, currency, compact = false }: ScheduleTableProps) {
  return (
    <div className="table-wrap" style={{ border: 0 }}>
      <table className={`table ${compact ? 'table-compact' : ''}`}>
        <thead>
          <tr>
            <th>#</th>
            <th>Vence</th>
            <th className="text-right">Capital</th>
            <th className="text-right">Interés</th>
            <th className="text-right">Comisión</th>
            <th className="text-right">Cuota</th>
            <th className="text-right">Pendiente</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {installments.map((installment) => (
            <tr key={installment.id}>
              <td className="numeric">{String(installment.number).padStart(2, '0')}</td>
              <td>{dateShort(installment.dueDate)}</td>
              <td className="text-right numeric">{money(installment.principalCents, currency)}</td>
              <td className="text-right numeric">{money(installment.interestCents, currency)}</td>
              <td className="text-right numeric">{money(installment.feeCents, currency)}</td>
              <td className="text-right numeric cell-strong">{money(installment.totalCents, currency)}</td>
              <td className="text-right numeric">{money(installment.outstandingCents, currency)}</td>
              <td>
                <StatusBadge map={installmentStatus} value={installment.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
