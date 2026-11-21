import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Info } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { api, buildQuery, errorMessage } from '../../lib/api';
import { money, todayDateOnly } from '../../lib/format';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';
import { useQueryClient } from '@tanstack/react-query';
import type { LoanSummary, Paginated } from '@shared/types';

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  loanId?: string;
  loanLabel?: string;
  suggestedAmountCents?: number;
}

export function PaymentModal({ open, onClose, onSaved, loanId, loanLabel, suggestedAmountCents }: PaymentModalProps) {
  const { activeMembership } = useAuth();
  const currency = activeMembership?.currency ?? 'NIO';
  const toast = useToast();
  const queryClient = useQueryClient();

  const [selectedLoanId, setSelectedLoanId] = useState(loanId ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'transfer' | 'card' | 'other'>('cash');
  const [paidAt, setPaidAt] = useState(todayDateOnly());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<'regular' | 'capital'>('regular');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedLoanId(loanId ?? '');
    setAmount(suggestedAmountCents && suggestedAmountCents > 0 ? (suggestedAmountCents / 100).toFixed(2) : '');
    setMethod('cash');
    setPaidAt(todayDateOnly());
    setReference('');
    setNotes('');
    setMode('regular');
  }, [open, loanId, suggestedAmountCents]);

  const loansQuery = useQuery({
    queryKey: ['loans-payment-select'],
    queryFn: () => api.get<Paginated<LoanSummary>>(`/api/loans${buildQuery({ page: 1, pageSize: 100, status: 'active' })}`),
    enabled: open && !loanId,
  });

  const loans = loansQuery.data?.items ?? [];
  const activeLoan = loanId ? loanId : selectedLoanId;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const cents = Math.round(Number.parseFloat(amount.replace(',', '.')) * 100);
    if (!activeLoan) {
      toast.error('Selecciona el préstamo que recibe el pago.');
      return;
    }
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error('Ingresa un monto válido.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/payments', {
        loanId: activeLoan,
        amountCents: cents,
        method,
        paidAt,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        mode,
      });
      toast.success(mode === 'capital' ? 'Abono a capital registrado.' : 'Pago registrado y aplicado.');
      await queryClient.invalidateQueries();
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar pago"
      subtitle={loanLabel ? `Préstamo ${loanLabel}` : 'Selecciona el préstamo y registra el cobro.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={saving} icon={<Banknote size={16} />}>
            Registrar pago
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={onSubmit} noValidate>
        {!loanId && (
          <Select
            label="Préstamo"
            required
            value={selectedLoanId}
            onChange={(event) => setSelectedLoanId(event.target.value)}
            options={[
              { value: '', label: 'Selecciona un préstamo…' },
              ...loans.map((loan) => ({
                value: loan.id,
                label: `${loan.code} · ${loan.clientName} · pendiente ${money(loan.metrics.outstandingCents, loan.currency)}`,
              })),
            ]}
            hint={loansQuery.isLoading ? 'Cargando préstamos…' : undefined}
          />
        )}

        <div className="field-grid">
          <Input
            label="Monto recibido"
            required
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            suffix={currency}
            hint="Si el pago excede el saldo, se rechazará."
          />
          <Input label="Fecha de pago" type="date" required value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
        </div>

        <div className="field-grid">
          <Select
            label="Método"
            value={method}
            onChange={(event) => setMethod(event.target.value as typeof method)}
            options={[
              { value: 'cash', label: 'Efectivo' },
              { value: 'transfer', label: 'Transferencia' },
              { value: 'card', label: 'Tarjeta' },
              { value: 'other', label: 'Otro' },
            ]}
          />
          <Input
            label="Tipo de pago"
            value={mode === 'regular' ? 'Pago de cuota' : 'Abono a capital'}
            readOnly
            onChange={() => undefined}
            hint={mode === 'regular' ? 'Se aplica mora → interés → capital → comisión' : 'Reduce capital y reamortiza el saldo'}
          />
        </div>

        <div className="row" style={{ gap: '0.4rem' }}>
          <button
            type="button"
            className="tab"
            aria-selected={mode === 'regular'}
            style={{
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: mode === 'regular' ? 'var(--surface-3)' : 'transparent',
            }}
            onClick={() => setMode('regular')}
          >
            Pago de cuota
          </button>
          <button
            type="button"
            className="tab"
            aria-selected={mode === 'capital'}
            style={{
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: mode === 'capital' ? 'var(--surface-3)' : 'transparent',
            }}
            onClick={() => setMode('capital')}
          >
            Abono a capital
          </button>
        </div>

        <Input
          label="Referencia"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Número de comprobante o transferencia"
        />

        <Input label="Notas" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />

        <div className="alert">
          <Info size={15} />
          <span>
            Cada pago queda auditado. Si necesitas corregirlo, se revierte con motivo; nunca se elimina.
          </span>
        </div>

        <button type="submit" className="visually-hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Modal>
  );
}
