import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Layers, Package, Receipt } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { api, errorMessage } from '../../lib/api';
import { money } from '../../lib/format';
import { useToast } from '../../components/ui/Toasts';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { SubscriptionQuote } from '@shared/billing/pricing';
import type { CatalogAddonSummary, CatalogModuleSummary, PlanSummary } from '@shared/types';

interface ConfigView {
  planKey: string;
  billingCycle: 'monthly' | 'yearly';
  moduleKeys: string[];
  addons: Array<{ key: string; quantity: number }>;
  quote: SubscriptionQuote | null;
}

interface ExceededLimit {
  metric: string;
  label: string;
  limit: number;
  current: number;
}

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  currency: 'NIO' | 'USD';
  status: string;
}

export function AdminOrgSubscriptionPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();

  const orgQuery = useQuery({
    queryKey: ['admin-org', id],
    queryFn: () => api.get<{ organization: OrgInfo }>(`/api/admin/organizations/${id}`),
  });

  const configQuery = useQuery({
    queryKey: ['admin-org-sub', id],
    queryFn: () => api.get<{ config: ConfigView }>(`/api/admin/organizations/${id}/subscription-config`),
  });

  const plansQuery = useQuery({
    queryKey: ['admin-plans-select'],
    queryFn: () => api.get<{ items: PlanSummary[] }>('/api/admin/plans'),
  });

  const catalogQuery = useQuery({
    queryKey: ['admin-catalog-full'],
    queryFn: () =>
      api.get<{ modules: CatalogModuleSummary[]; addons: CatalogAddonSummary[] }>('/api/admin/catalog'),
  });

  const [planKey, setPlanKey] = useState('');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [moduleKeys, setModuleKeys] = useState<string[]>([]);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ready || !configQuery.data) return;
    const config = configQuery.data.config;
    setPlanKey(config.planKey);
    setCycle(config.billingCycle);
    setModuleKeys(config.moduleKeys);
    setAddonQty(Object.fromEntries(config.addons.map((addon) => [addon.key, addon.quantity])));
    setReady(true);
  }, [configQuery.data, ready]);

  const modules = catalogQuery.data?.modules ?? [];
  const addons = catalogQuery.data?.addons ?? [];
  const plans = plansQuery.data?.items ?? [];

  const body = useMemo(
    () => ({
      planKey,
      billingCycle: cycle,
      moduleKeys,
      addons: Object.entries(addonQty)
        .filter(([, quantity]) => quantity > 0)
        .map(([key, quantity]) => ({ key, quantity })),
    }),
    [planKey, cycle, moduleKeys, addonQty],
  );

  const debounced = useDebouncedValue(body, 320);

  const previewQuery = useQuery({
    queryKey: ['admin-org-sub-preview', id, debounced],
    queryFn: () =>
      api.post<{ quote: SubscriptionQuote; exceeded: ExceededLimit[] }>(
        `/api/admin/organizations/${id}/subscription-config/preview`,
        debounced,
      ),
    enabled: ready && Boolean(debounced.planKey),
  });

  const quote = previewQuery.data?.quote ?? configQuery.data?.config.quote ?? null;
  const exceeded = previewQuery.data?.exceeded ?? [];

  const moduleIncluded = (module: CatalogModuleSummary) => module.planKeys.includes(planKey);
  const maxAddon = (addon: CatalogAddonSummary) =>
    addon.plans.find((item) => item.planKey === planKey)?.maxQuantity ?? 0;

  const changePlan = (next: string) => {
    setPlanKey(next);
    setModuleKeys((current) =>
      current.filter((key) => {
        const module = modules.find((item) => item.key === key);
        return module ? module.planKeys.includes(next) : false;
      }),
    );
    setAddonQty((current) => {
      const updated: Record<string, number> = {};
      for (const [key, quantity] of Object.entries(current)) {
        const addon = addons.find((item) => item.key === key);
        const max = addon ? (addon.plans.find((item) => item.planKey === next)?.maxQuantity ?? 0) : 0;
        const value = Math.min(quantity, max);
        if (value > 0) updated[key] = value;
      }
      return updated;
    });
  };

  const toggleModule = (key: string) => {
    setModuleKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const setQuantity = (addon: CatalogAddonSummary, quantity: number) => {
    const max = maxAddon(addon);
    setAddonQty((current) => {
      const next = { ...current };
      const value = Math.max(0, Math.min(quantity, max));
      if (value === 0) delete next[addon.key];
      else next[addon.key] = value;
      return next;
    });
  };

  const apply = async () => {
    setSaving(true);
    try {
      await api.post(`/api/admin/organizations/${id}/subscription-config`, body);
      toast.success('Suscripción actualizada.');
      await queryClient.invalidateQueries({ queryKey: ['admin-org-sub', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-orgs'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (orgQuery.isLoading || configQuery.isLoading || catalogQuery.isLoading) {
    return <LoadingBlock label="Cargando suscripción…" />;
  }

  if (configQuery.isError) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(configQuery.error)}</span>
      </div>
    );
  }

  const org = orgQuery.data?.organization;

  return (
    <>
      <PageHeader
        icon={<Receipt size={16} />}
        title={`Suscripción · ${org?.name ?? 'Organización'}`}
        description="Plan, módulos y complementos que paga este negocio."
        actions={
          <Link to="/admin/organizaciones">
            <Button variant="ghost" icon={<ArrowLeft size={15} />}>
              Volver
            </Button>
          </Link>
        }
      />

      <div className="detail-grid">
        <div className="dashboard-stack">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <Layers size={13} />
                  </span>
                  Plan
                </div>
                <div className="card-subtitle">El plan define los límites base y los módulos incluidos.</div>
              </div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span className="field-label">Plan contratado</span>
                <select className="select" value={planKey} onChange={(event) => changePlan(event.target.value)}>
                  {plans.map((plan) => (
                    <option key={plan.key} value={plan.key}>
                      {plan.name} ·{' '}
                      {money(
                        cycle === 'yearly' ? plan.priceYearlyCents : plan.priceMonthlyCents,
                        plan.currency as 'NIO' | 'USD',
                      )}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Periodicidad</span>
                <select
                  className="select"
                  value={cycle}
                  onChange={(event) => setCycle(event.target.value as 'monthly' | 'yearly')}
                >
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                </select>
              </label>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <span className="icon-chip">
                    <Package size={13} />
                  </span>
                  Módulos
                </div>
                <div className="card-subtitle">
                  Los incluidos en el plan no se cobran aparte; los adicionales se suman al total.
                </div>
              </div>
            </div>

            <div className="dashboard-stack" style={{ gap: '0.35rem' }}>
              {modules.map((module) => {
                const included = moduleIncluded(module);
                const price = cycle === 'yearly' ? module.priceYearlyCents : module.priceMonthlyCents;
                return (
                  <label
                    key={module.key}
                    className="meta-row"
                    style={{ cursor: included ? 'default' : 'pointer', opacity: included ? 0.75 : 1 }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={included || moduleKeys.includes(module.key)}
                        disabled={included || !module.isActive}
                        onChange={() => toggleModule(module.key)}
                      />
                      {module.name}
                    </span>
                    <strong>
                      {included ? (
                        <Badge tone="success">Incluido</Badge>
                      ) : price === 0 ? (
                        'Sin costo'
                      ) : (
                        `${money(price, module.currency as 'NIO' | 'USD')} / ${cycle === 'yearly' ? 'año' : 'mes'}`
                      )}
                    </strong>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Complementos de capacidad</div>
                <div className="card-subtitle">Amplían clientes, préstamos, usuarios o almacenamiento del plan.</div>
              </div>
            </div>

            <div className="dashboard-stack" style={{ gap: '0.35rem' }}>
              {addons
                .filter((addon) => addon.isActive)
                .map((addon) => {
                  const max = maxAddon(addon);
                  const quantity = addonQty[addon.key] ?? 0;
                  return (
                    <div key={addon.key} className="meta-row">
                      <span>
                        {addon.name}
                        <span className="field-hint" style={{ display: 'block' }}>
                          {max === 0
                            ? 'No disponible en este plan'
                            : `Máximo ${max} · ${money(addon.priceMonthlyCents, addon.currency as 'NIO' | 'USD')} c/u al mes`}
                        </span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Button variant="ghost" size="sm" disabled={max === 0 || quantity === 0} onClick={() => setQuantity(addon, quantity - 1)}>
                          −
                        </Button>
                        <strong className="numeric" style={{ minWidth: 22, textAlign: 'center' }}>
                          {quantity}
                        </strong>
                        <Button variant="ghost" size="sm" disabled={max === 0 || quantity >= max} onClick={() => setQuantity(addon, quantity + 1)}>
                          +
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>

        <div className="dashboard-stack">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Resumen del cobro</div>
                <div className="card-subtitle">Calculado con el catálogo vigente.</div>
              </div>
            </div>

            {previewQuery.isError && (
              <div className="alert alert-danger">
                <span>{errorMessage(previewQuery.error)}</span>
              </div>
            )}

            {quote && (
              <>
                <div className="dashboard-stack" style={{ gap: '0.3rem' }}>
                  {quote.lines.map((line) => (
                    <div key={`${line.kind}-${line.key}`} className="meta-row">
                      <span>
                        {line.kind === 'plan' ? 'Plan' : line.kind === 'module' ? 'Módulo' : 'Complemento'} · {line.key}
                        {line.quantity > 1 ? ` × ${line.quantity}` : ''}
                      </span>
                      <strong className="numeric">{money(line.totalCents, quote.currency as 'NIO' | 'USD')}</strong>
                    </div>
                  ))}
                </div>

                <div className="meta-row" style={{ borderTop: '1px solid var(--border)', marginTop: '0.6rem', paddingTop: '0.6rem' }}>
                  <span>Total {quote.billingCycle === 'yearly' ? 'anual' : 'mensual'}</span>
                  <strong className="numeric" style={{ fontSize: 'var(--text-lg)' }}>
                    {money(quote.totalCents, quote.currency as 'NIO' | 'USD')}
                  </strong>
                </div>

                {quote.discountCents > 0 && (
                  <p className="field-hint">
                    Ahorro anual de {money(quote.discountCents, quote.currency as 'NIO' | 'USD')} frente al pago mensual.
                  </p>
                )}
              </>
            )}

            {exceeded.length > 0 && (
              <div className="alert alert-warning" style={{ marginTop: '0.75rem' }}>
                <span>
                  El uso actual supera el límite de {exceeded.map((item) => `${item.label} (${item.current}/${item.limit})`).join(', ')}.
                  Ajusta el plan o añade complementos.
                </span>
              </div>
            )}

            <Button
              variant="primary"
              loading={saving}
              disabled={Boolean(previewQuery.isError) || exceeded.length > 0}
              onClick={apply}
              style={{ marginTop: '0.75rem', width: '100%' }}
            >
              Aplicar cambios
            </Button>
            <p className="field-hint" style={{ marginTop: '0.5rem' }}>
              Se conserva el historial: los módulos retirados quedan cancelados, no se borra ningún dato.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
