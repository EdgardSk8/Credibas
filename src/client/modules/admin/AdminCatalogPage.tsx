import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Checkbox, Input, Select, Textarea } from '../../components/ui/Field';
import { api, errorMessage } from '../../lib/api';
import { money } from '../../lib/format';
import { useToast } from '../../components/ui/Toasts';
import type { CatalogAddonSummary, CatalogModuleSummary } from '@shared/types';

interface CatalogResponse {
  modules: CatalogModuleSummary[];
  addons: CatalogAddonSummary[];
  plans: Array<{ key: string; name: string; isActive: boolean }>;
}

const METRICS = [
  { value: 'clients', label: 'Clientes' },
  { value: 'active_loans', label: 'Préstamos activos' },
  { value: 'users', label: 'Usuarios' },
  { value: 'storage_mb', label: 'Almacenamiento (MB)' },
  { value: 'collectors', label: 'Cobradores' },
  { value: 'branches', label: 'Sucursales' },
  { value: 'exports_per_month', label: 'Exportaciones / mes' },
  { value: 'history_days', label: 'Historial (días)' },
];

interface ModuleFormState {
  id?: string;
  key: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  isCore: boolean;
  isActive: boolean;
  sortOrder: string;
  features: string;
  dependencyKeys: string[];
  planKeys: string[];
}

interface AddonFormState {
  id?: string;
  key: string;
  name: string;
  description: string;
  metric: string;
  unitAmount: string;
  unitLabel: string;
  priceMonthly: string;
  priceYearly: string;
  isActive: boolean;
  sortOrder: string;
  plans: Record<string, string>;
}

function emptyModule(): ModuleFormState {
  return {
    key: '',
    name: '',
    description: '',
    priceMonthly: '0',
    priceYearly: '0',
    isCore: false,
    isActive: true,
    sortOrder: '0',
    features: '',
    dependencyKeys: [],
    planKeys: [],
  };
}

function emptyAddon(plans: CatalogResponse['plans']): AddonFormState {
  return {
    key: '',
    name: '',
    description: '',
    metric: 'clients',
    unitAmount: '100',
    unitLabel: '',
    priceMonthly: '0',
    priceYearly: '0',
    isActive: true,
    sortOrder: '0',
    plans: Object.fromEntries(plans.map((plan) => [plan.key, '0'])),
  };
}

const toCents = (value: string) => Math.round((Number(value) || 0) * 100);
const toInput = (cents: number) => (cents / 100).toFixed(2);

export function AdminCatalogPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [moduleForm, setModuleForm] = useState<ModuleFormState | null>(null);
  const [addonForm, setAddonForm] = useState<AddonFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ['admin-catalog'],
    queryFn: () => api.get<CatalogResponse>('/api/admin/catalog'),
  });

  const plans = query.data?.plans ?? [];
  const planName = useMemo(
    () => Object.fromEntries(plans.map((plan) => [plan.key, plan.name])) as Record<string, string>,
    [plans],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-catalog'] });

  const openNewModule = () => setModuleForm(emptyModule());
  const openEditModule = (module: CatalogModuleSummary) =>
    setModuleForm({
      id: module.id,
      key: module.key,
      name: module.name,
      description: module.description ?? '',
      priceMonthly: toInput(module.priceMonthlyCents),
      priceYearly: toInput(module.priceYearlyCents),
      isCore: module.isCore,
      isActive: module.isActive,
      sortOrder: String(module.sortOrder),
      features: module.features.join('\n'),
      dependencyKeys: module.dependencyKeys,
      planKeys: module.planKeys,
    });

  const openNewAddon = () => setAddonForm(emptyAddon(plans));
  const openEditAddon = (addon: CatalogAddonSummary) =>
    setAddonForm({
      id: addon.id,
      key: addon.key,
      name: addon.name,
      description: addon.description ?? '',
      metric: addon.metric,
      unitAmount: String(addon.unitAmount),
      unitLabel: addon.unitLabel,
      priceMonthly: toInput(addon.priceMonthlyCents),
      priceYearly: toInput(addon.priceYearlyCents),
      isActive: addon.isActive,
      sortOrder: String(addon.sortOrder),
      plans: Object.fromEntries(
        plans.map((plan) => [
          plan.key,
          String(addon.plans.find((item) => item.planKey === plan.key)?.maxQuantity ?? 0),
        ]),
      ),
    });

  const saveModule = async () => {
    if (!moduleForm) return;
    setSaving(true);
    try {
      const payload = {
        key: moduleForm.key.trim(),
        name: moduleForm.name.trim(),
        description: moduleForm.description.trim() || null,
        priceMonthlyCents: toCents(moduleForm.priceMonthly),
        priceYearlyCents: toCents(moduleForm.priceYearly),
        isCore: moduleForm.isCore,
        isActive: moduleForm.isActive,
        sortOrder: Number(moduleForm.sortOrder) || 0,
        features: moduleForm.features.split('\n').map((item) => item.trim()).filter(Boolean),
        dependencyKeys: moduleForm.dependencyKeys,
        planKeys: moduleForm.planKeys,
      };
      if (moduleForm.id) {
        await api.patch(`/api/admin/modules/${moduleForm.id}`, payload);
        toast.success('Módulo actualizado.');
      } else {
        await api.post('/api/admin/modules', payload);
        toast.success('Módulo creado.');
      }
      setModuleForm(null);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveAddon = async () => {
    if (!addonForm) return;
    setSaving(true);
    try {
      const payload = {
        key: addonForm.key.trim(),
        name: addonForm.name.trim(),
        description: addonForm.description.trim() || null,
        metric: addonForm.metric,
        unitAmount: Number(addonForm.unitAmount) || 0,
        unitLabel: addonForm.unitLabel.trim(),
        priceMonthlyCents: toCents(addonForm.priceMonthly),
        priceYearlyCents: toCents(addonForm.priceYearly),
        isActive: addonForm.isActive,
        sortOrder: Number(addonForm.sortOrder) || 0,
        plans: Object.entries(addonForm.plans)
          .map(([planKey, value]) => ({ planKey, maxQuantity: Number(value) || 0 }))
          .filter((item) => item.maxQuantity > 0),
      };
      if (addonForm.id) {
        await api.patch(`/api/admin/addons/${addonForm.id}`, payload);
        toast.success('Complemento actualizado.');
      } else {
        await api.post('/api/admin/addons', payload);
        toast.success('Complemento creado.');
      }
      setAddonForm(null);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading) return <LoadingBlock label="Cargando catálogo…" />;
  if (query.isError) {
    return (
      <div className="alert alert-danger">
        <span>{errorMessage(query.error)}</span>
      </div>
    );
  }

  const modules = query.data?.modules ?? [];
  const addons = query.data?.addons ?? [];
  const metricLabel = (metric: string) => METRICS.find((item) => item.value === metric)?.label ?? metric;

  const toggleInArray = (values: string[], value: string) =>
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

  return (
    <>
      <PageHeader
        icon={<Boxes size={16} />}
        title="Catálogo comercial"
        description="Módulos funcionales y complementos de capacidad. Los precios del plan se editan en Planes."
      />

      <section className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Módulos funcionales</div>
            <div className="card-subtitle">Lo que el negocio puede contratar además del plan base.</div>
          </div>
          <Button size="sm" variant="secondary" onClick={openNewModule}>
            <Plus size={14} /> Nuevo módulo
          </Button>
        </div>

        <div className="table-wrap" style={{ border: 0 }}>
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Módulo</th>
                <th>Clave</th>
                <th className="text-right">Mensual</th>
                <th className="text-right">Anual</th>
                <th>Incluido en</th>
                <th>Depende de</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => (
                <tr key={module.id}>
                  <td className="cell-strong">
                    {module.name}
                    {module.isCore && <span className="badge badge-accent" style={{ marginLeft: 6 }}>Núcleo</span>}
                  </td>
                  <td className="mono">{module.key}</td>
                  <td className="text-right numeric">{money(module.priceMonthlyCents, 'USD')}</td>
                  <td className="text-right numeric">{money(module.priceYearlyCents, 'USD')}</td>
                  <td>
                    {module.planKeys.length === 0
                      ? '—'
                      : module.planKeys.map((key) => planName[key] ?? key).join(', ')}
                  </td>
                  <td>{module.dependencyKeys.length === 0 ? '—' : module.dependencyKeys.join(', ')}</td>
                  <td>
                    <span className={`badge ${module.isActive ? 'badge-success' : 'badge-neutral'}`}>
                      {module.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="cell-actions">
                    <Button size="sm" variant="ghost" onClick={() => openEditModule(module)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Complementos de capacidad</div>
            <div className="card-subtitle">Amplían un límite sin cambiar de plan.</div>
          </div>
          <Button size="sm" variant="secondary" onClick={openNewAddon}>
            <Plus size={14} /> Nuevo complemento
          </Button>
        </div>

        <div className="table-wrap" style={{ border: 0 }}>
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Complemento</th>
                <th>Límite</th>
                <th className="text-right">Mensual</th>
                <th className="text-right">Anual</th>
                <th>Planes (máx.)</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {addons.map((addon) => (
                <tr key={addon.id}>
                  <td className="cell-strong">{addon.name}</td>
                  <td>
                    {metricLabel(addon.metric)} · +{addon.unitAmount} {addon.unitLabel}
                  </td>
                  <td className="text-right numeric">{money(addon.priceMonthlyCents, 'USD')}</td>
                  <td className="text-right numeric">{money(addon.priceYearlyCents, 'USD')}</td>
                  <td>
                    {addon.plans.length === 0
                      ? '—'
                      : addon.plans.map((item) => `${planName[item.planKey] ?? item.planKey} (${item.maxQuantity})`).join(', ')}
                  </td>
                  <td>
                    <span className={`badge ${addon.isActive ? 'badge-success' : 'badge-neutral'}`}>
                      {addon.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="cell-actions">
                    <Button size="sm" variant="ghost" onClick={() => openEditAddon(addon)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={Boolean(moduleForm)}
        onClose={() => setModuleForm(null)}
        title={moduleForm?.id ? 'Editar módulo' : 'Nuevo módulo'}
        subtitle="Precio y disponibilidad por plan"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModuleForm(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={saveModule}>
              Guardar
            </Button>
          </>
        }
      >
        {moduleForm && (
          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            <div className="field-grid">
              <Input
                label="Clave"
                value={moduleForm.key}
                onChange={(event) => setModuleForm({ ...moduleForm, key: event.target.value })}
                hint="minúsculas, números y guion bajo"
              />
              <Input
                label="Nombre"
                value={moduleForm.name}
                onChange={(event) => setModuleForm({ ...moduleForm, name: event.target.value })}
              />
            </div>
            <Textarea
              label="Descripción"
              value={moduleForm.description}
              maxLength={240}
              onChange={(event) => setModuleForm({ ...moduleForm, description: event.target.value })}
            />
            <div className="field-grid">
              <Input
                label="Precio mensual (USD)"
                value={moduleForm.priceMonthly}
                onChange={(event) => setModuleForm({ ...moduleForm, priceMonthly: event.target.value })}
              />
              <Input
                label="Precio anual (USD)"
                value={moduleForm.priceYearly}
                onChange={(event) => setModuleForm({ ...moduleForm, priceYearly: event.target.value })}
              />
              <Input
                label="Orden"
                value={moduleForm.sortOrder}
                onChange={(event) => setModuleForm({ ...moduleForm, sortOrder: event.target.value })}
              />
            </div>
            <Textarea
              label="Funcionalidades (una por línea)"
              value={moduleForm.features}
              onChange={(event) => setModuleForm({ ...moduleForm, features: event.target.value })}
            />
            <div>
              <div className="field-label">Incluido en los planes</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                {plans.map((plan) => (
                  <Checkbox
                    key={plan.key}
                    label={plan.name}
                    checked={moduleForm.planKeys.includes(plan.key)}
                    onChange={() =>
                      setModuleForm({ ...moduleForm, planKeys: toggleInArray(moduleForm.planKeys, plan.key) })
                    }
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="field-label">Depende de</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                {modules
                  .filter((module) => module.key !== moduleForm.key)
                  .map((module) => (
                    <Checkbox
                      key={module.id}
                      label={module.name}
                      checked={moduleForm.dependencyKeys.includes(module.key)}
                      onChange={() =>
                        setModuleForm({
                          ...moduleForm,
                          dependencyKeys: toggleInArray(moduleForm.dependencyKeys, module.key),
                        })
                      }
                    />
                  ))}
              </div>
            </div>
            <div className="row" style={{ gap: '1.25rem', flexWrap: 'wrap' }}>
              <Checkbox
                label="Módulo núcleo (obligatorio)"
                checked={moduleForm.isCore}
                onChange={() => setModuleForm({ ...moduleForm, isCore: !moduleForm.isCore })}
              />
              <Checkbox
                label="Activo"
                checked={moduleForm.isActive}
                onChange={() => setModuleForm({ ...moduleForm, isActive: !moduleForm.isActive })}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(addonForm)}
        onClose={() => setAddonForm(null)}
        title={addonForm?.id ? 'Editar complemento' : 'Nuevo complemento'}
        subtitle="Capacidad adicional y compatibilidad por plan"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddonForm(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={saveAddon}>
              Guardar
            </Button>
          </>
        }
      >
        {addonForm && (
          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            <div className="field-grid">
              <Input
                label="Clave"
                value={addonForm.key}
                onChange={(event) => setAddonForm({ ...addonForm, key: event.target.value })}
              />
              <Input
                label="Nombre"
                value={addonForm.name}
                onChange={(event) => setAddonForm({ ...addonForm, name: event.target.value })}
              />
            </div>
            <Textarea
              label="Descripción"
              value={addonForm.description}
              maxLength={240}
              onChange={(event) => setAddonForm({ ...addonForm, description: event.target.value })}
            />
            <div className="field-grid">
              <Select
                label="Límite que amplía"
                value={addonForm.metric}
                options={METRICS}
                onChange={(event) => setAddonForm({ ...addonForm, metric: event.target.value })}
              />
              <Input
                label="Cantidad por unidad"
                value={addonForm.unitAmount}
                onChange={(event) => setAddonForm({ ...addonForm, unitAmount: event.target.value })}
              />
              <Input
                label="Unidad"
                value={addonForm.unitLabel}
                onChange={(event) => setAddonForm({ ...addonForm, unitLabel: event.target.value })}
              />
            </div>
            <div className="field-grid">
              <Input
                label="Precio mensual (USD)"
                value={addonForm.priceMonthly}
                onChange={(event) => setAddonForm({ ...addonForm, priceMonthly: event.target.value })}
              />
              <Input
                label="Precio anual (USD)"
                value={addonForm.priceYearly}
                onChange={(event) => setAddonForm({ ...addonForm, priceYearly: event.target.value })}
              />
              <Input
                label="Orden"
                value={addonForm.sortOrder}
                onChange={(event) => setAddonForm({ ...addonForm, sortOrder: event.target.value })}
              />
            </div>
            <div>
              <div className="field-label">Máximo por plan (0 = no disponible)</div>
              <div className="field-grid">
                {plans.map((plan) => (
                  <Input
                    key={plan.key}
                    label={plan.name}
                    value={addonForm.plans[plan.key] ?? '0'}
                    onChange={(event) =>
                      setAddonForm({
                        ...addonForm,
                        plans: { ...addonForm.plans, [plan.key]: event.target.value },
                      })
                    }
                  />
                ))}
              </div>
            </div>
            <Checkbox
              label="Activo"
              checked={addonForm.isActive}
              onChange={() => setAddonForm({ ...addonForm, isActive: !addonForm.isActive })}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
