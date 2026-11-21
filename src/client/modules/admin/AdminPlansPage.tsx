import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, Save } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { LoadingBlock } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { api, errorMessage } from '../../lib/api';
import { money } from '../../lib/format';
import { useToast } from '../../components/ui/Toasts';
import type { PlanSummary } from '@shared/types';

const LIMIT_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'users', label: 'Usuarios' },
  { key: 'clients', label: 'Clientes' },
  { key: 'active_loans', label: 'Préstamos activos' },
  { key: 'storage_mb', label: 'Almacenamiento (MB)' },
  { key: 'collectors', label: 'Cobradores' },
  { key: 'branches', label: 'Sucursales' },
  { key: 'exports_per_month', label: 'Exportaciones / mes' },
  { key: 'history_days', label: 'Días de historial' },
];

interface PlanForm {
  key: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  trialDays: string;
  graceDays: string;
  sortOrder: string;
  isActive: boolean;
  isPublic: boolean;
  features: string;
  limits: Record<string, string>;
}

const emptyPlan: PlanForm = {
  key: '',
  name: '',
  description: '',
  priceMonthly: '0.00',
  priceYearly: '0.00',
  trialDays: '14',
  graceDays: '7',
  sortOrder: '40',
  isActive: true,
  isPublic: true,
  features: '',
  limits: Object.fromEntries(LIMIT_FIELDS.map((field) => [field.key, '0'])),
};

export function AdminPlansPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyPlan);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get<{ items: PlanSummary[] }>('/api/admin/plans'),
  });

  const openEdit = (plan: PlanSummary) => {
    setEditingKey(plan.key);
    setForm({
      key: plan.key,
      name: plan.name,
      description: plan.description ?? '',
      priceMonthly: (plan.priceMonthlyCents / 100).toFixed(2),
      priceYearly: (plan.priceYearlyCents / 100).toFixed(2),
      trialDays: String(plan.trialDays),
      graceDays: String(plan.limits.grace_days ?? 7),
      sortOrder: String(plan.sortOrder),
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      features: plan.features.join('\n'),
      limits: Object.fromEntries(LIMIT_FIELDS.map((field) => [field.key, String(plan.limits[field.key] ?? 0)])),
    });
  };

  const openNew = () => {
    setEditingKey('');
    setForm(emptyPlan);
  };

  const save = async () => {
    if (form.key.trim().length < 2 || form.name.trim().length < 2) {
      toast.error('Completa la clave y el nombre del plan.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/admin/plans', {
        key: form.key.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        priceMonthlyCents: Math.round(Number.parseFloat(form.priceMonthly.replace(',', '.')) * 100) || 0,
        priceYearlyCents: Math.round(Number.parseFloat(form.priceYearly.replace(',', '.')) * 100) || 0,
        currency: 'USD',
        trialDays: Number(form.trialDays) || 0,
        graceDays: Number(form.graceDays) || 0,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
        isPublic: form.isPublic,
        features: form.features
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        limits: Object.fromEntries(
          LIMIT_FIELDS.map((field) => [field.key, Number.parseInt(form.limits[field.key] || '0', 10) || 0]),
        ),
      });
      toast.success('Plan guardado.');
      setEditingKey(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      await queryClient.invalidateQueries({ queryKey: ['public-plans'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading) return <LoadingBlock label="Cargando planes…" />;

  return (
    <>
      <PageHeader
        title="Planes"
        description="Los precios y límites viven en la base de datos: aquí se editan sin tocar código."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
            Nuevo plan
          </Button>
        }
      />

      <div className="bento">
        {(query.data?.items ?? []).map((plan) => (
          <article className="bento-item bento-span-6" key={plan.key}>
            <div className="row-between">
              <div>
                <div className="row" style={{ gap: '0.5rem' }}>
                  <div className="bento-icon">
                    <CreditCard size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 'var(--text-md)' }}>{plan.name}</h3>
                    <span className="field-hint">clave: {plan.key}</span>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="numeric" style={{ fontWeight: 700 }}>
                  {money(plan.priceMonthlyCents, 'USD')}
                  <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> /mes</span>
                </div>
                <span className="field-hint">{money(plan.priceYearlyCents, 'USD')} /año</span>
              </div>
            </div>

            <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
              <Badge tone={plan.isActive ? 'success' : 'neutral'}>{plan.isActive ? 'Activo' : 'Inactivo'}</Badge>
              <Badge tone={plan.isPublic ? 'accent' : 'neutral'}>{plan.isPublic ? 'Público' : 'Oculto'}</Badge>
              <Badge tone="neutral">{plan.trialDays} días de prueba</Badge>
            </div>

            <p className="field-hint" style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
              <span>Usuarios: {plan.limits.users ?? '∞'}</span>
              <span>Clientes: {plan.limits.clients ?? '∞'}</span>
              <span>Préstamos: {plan.limits.active_loans ?? '∞'}</span>
            </p>

            <Button variant="secondary" size="sm" onClick={() => openEdit(plan)}>
              Editar plan
            </Button>
          </article>
        ))}
      </div>

      <Modal
        open={editingKey !== null}
        onClose={() => setEditingKey(null)}
        title={editingKey ? 'Editar plan' : 'Nuevo plan'}
        subtitle="Los cambios afectan a nuevas suscripciones y a los límites vigentes."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingKey(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} loading={saving} icon={<Save size={15} />}>
              Guardar plan
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="field-grid">
            <Input
              label="Clave"
              required
              value={form.key}
              disabled={Boolean(editingKey)}
              onChange={(event) => setForm({ ...form, key: event.target.value })}
              hint="Identificador interno (starter, professional…)"
            />
            <Input label="Nombre" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>

          <Textarea
            label="Descripción"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />

          <div className="field-grid-3">
            <Input
              label="Precio mensual"
              inputMode="decimal"
              suffix="USD"
              value={form.priceMonthly}
              onChange={(event) => setForm({ ...form, priceMonthly: event.target.value })}
            />
            <Input
              label="Precio anual"
              inputMode="decimal"
              suffix="USD"
              value={form.priceYearly}
              onChange={(event) => setForm({ ...form, priceYearly: event.target.value })}
            />
            <Input
              label="Orden"
              type="number"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
            />
          </div>

          <div className="field-grid-3">
            <Input
              label="Días de prueba"
              type="number"
              value={form.trialDays}
              onChange={(event) => setForm({ ...form, trialDays: event.target.value })}
            />
            <Input
              label="Días de gracia"
              type="number"
              value={form.graceDays}
              onChange={(event) => setForm({ ...form, graceDays: event.target.value })}
            />
            <div className="field">
              <span className="field-label">Visibilidad</span>
              <div className="row" style={{ gap: '0.75rem' }}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                  />
                  <span>Activo</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.isPublic}
                    onChange={(event) => setForm({ ...form, isPublic: event.target.checked })}
                  />
                  <span>Público</span>
                </label>
              </div>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Límites del plan</span>
            <div className="field-grid-3">
              {LIMIT_FIELDS.map((field) => (
                <Input
                  key={field.key}
                  label={field.label}
                  type="number"
                  min={0}
                  value={form.limits[field.key] ?? '0'}
                  onChange={(event) =>
                    setForm({ ...form, limits: { ...form.limits, [field.key]: event.target.value } })
                  }
                />
              ))}
            </div>
          </div>

          <Textarea
            label="Características (una por línea)"
            value={form.features}
            onChange={(event) => setForm({ ...form, features: event.target.value })}
            placeholder={'Clientes y préstamos\nControl de cuotas y pagos\nReportes básicos'}
          />
        </div>
      </Modal>
    </>
  );
}
