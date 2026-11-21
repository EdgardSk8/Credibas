import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PlanSummary } from '@shared/types';

const FALLBACK_PLANS: PlanSummary[] = [
  {
    id: 'plan_starter',
    key: 'starter',
    name: 'Starter',
    description: 'Para prestamistas individuales que ordenan su cartera.',
    priceMonthlyCents: 990,
    priceYearlyCents: 9900,
    currency: 'USD',
    trialDays: 14,
    isActive: true,
    isPublic: true,
    sortOrder: 10,
    features: ['Clientes y préstamos', 'Control de cuotas y pagos', 'Reportes básicos', '1 usuario', 'Soporte por correo'],
    limits: { users: 1, clients: 300, active_loans: 150 },
  },
  {
    id: 'plan_professional',
    key: 'professional',
    name: 'Professional',
    description: 'Para negocios con cobradores y varias rutas de cobro.',
    priceMonthlyCents: 2490,
    priceYearlyCents: 24900,
    currency: 'USD',
    trialDays: 14,
    isActive: true,
    isPublic: true,
    sortOrder: 20,
    features: ['Todo lo de Starter', 'Hasta 5 usuarios', 'Gestión de cobradores', 'Caja y arqueos', 'Reportes avanzados', 'Exportaciones'],
    limits: { users: 5, clients: 2000, active_loans: 1000 },
  },
  {
    id: 'plan_business',
    key: 'business',
    name: 'Business',
    description: 'Para financieras con cartera alta y equipos completos.',
    priceMonthlyCents: 4990,
    priceYearlyCents: 49900,
    currency: 'USD',
    trialDays: 14,
    isActive: true,
    isPublic: true,
    sortOrder: 30,
    features: ['Todo lo de Professional', 'Hasta 15 usuarios', 'Roles personalizados', 'Sucursales', 'Mayor almacenamiento', 'Soporte prioritario'],
    limits: { users: 15, clients: 10000, active_loans: 5000 },
  },
];

export function usePublicPlans() {
  const query = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => api.get<{ items: PlanSummary[] }>('/api/public/plans'),
    staleTime: 5 * 60_000,
  });

  const plans = query.data?.items?.length ? query.data.items : FALLBACK_PLANS;
  return { plans, isLoading: query.isLoading };
}

export { FALLBACK_PLANS };
