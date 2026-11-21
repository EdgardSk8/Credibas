import type { BadgeTone } from '../components/ui/Badge';

export const loanStatus: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  active: { label: 'Activo', tone: 'success' },
  settled: { label: 'Liquidado', tone: 'accent' },
  defaulted: { label: 'En mora', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
  restructured: { label: 'Reestructurado', tone: 'warning' },
};

export const installmentStatus: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pendiente', tone: 'neutral' },
  partial: { label: 'Parcial', tone: 'warning' },
  paid: { label: 'Pagada', tone: 'success' },
  overdue: { label: 'Vencida', tone: 'danger' },
  restructured: { label: 'Reestructurada', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
};

export const paymentStatus: Record<string, { label: string; tone: BadgeTone }> = {
  confirmed: { label: 'Confirmado', tone: 'success' },
  reversed: { label: 'Revertido', tone: 'danger' },
};

export const paymentMethod: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
};

export const frequencyLabel: Record<string, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  custom: 'Personalizada',
};

export const methodLabel: Record<string, string> = {
  flat_interest: 'Interés plano',
  fixed_installment: 'Cuota fija',
  declining_principal: 'Saldo insoluto',
};

export const clientStatus: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
  blocked: { label: 'Bloqueado', tone: 'danger' },
};

export const subscriptionStatus: Record<string, { label: string; tone: BadgeTone }> = {
  trialing: { label: 'En prueba', tone: 'accent' },
  active: { label: 'Activa', tone: 'success' },
  past_due: { label: 'Pago pendiente', tone: 'warning' },
  canceled: { label: 'Cancelada', tone: 'neutral' },
  expired: { label: 'Expirada', tone: 'danger' },
};

export const collectionType: Record<string, string> = {
  call: 'Llamada',
  visit: 'Visita',
  message: 'Mensaje',
  promise: 'Promesa de pago',
  note: 'Nota',
};

export const cashCategory: Record<string, string> = {
  capital: 'Capital',
  interes: 'Interés',
  mora: 'Mora',
  comision: 'Comisión',
  gasto: 'Gasto',
  ajuste: 'Ajuste',
  otro: 'Otro',
  cuota: 'Cuota',
};

export const roleLabel: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  collector: 'Cobrador',
  viewer: 'Consulta',
};
