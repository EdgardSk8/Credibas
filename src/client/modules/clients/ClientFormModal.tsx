import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea, Field } from '../../components/ui/Field';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../components/ui/Toasts';
import type { ClientSummary, ClientReference } from '@shared/types';

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (clientId?: string) => void;
  client?: ClientSummary | null;
}

interface FormState {
  fullName: string;
  identification: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: 'active' | 'inactive' | 'blocked';
  references: ClientReference[];
}

const emptyForm: FormState = {
  fullName: '',
  identification: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  status: 'active',
  references: [],
};

export function ClientFormModal({ open, onClose, onSaved, client }: ClientFormModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (client) {
      setForm({
        fullName: client.fullName,
        identification: client.identification ?? '',
        phone: client.phone ?? '',
        email: client.email ?? '',
        address: client.address ?? '',
        notes: client.notes ?? '',
        status: client.status,
        references: client.references ?? [],
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
  }, [open, client]);

  const updateReference = (index: number, patch: Partial<ClientReference>) => {
    setForm((current) => ({
      ...current,
      references: current.references.map((reference, position) =>
        position === index ? { ...reference, ...patch } : reference,
      ),
    }));
  };

  const addReference = () => {
    setForm((current) => ({
      ...current,
      references: [...current.references, { name: '', phone: '', relationship: '' }],
    }));
  };

  const removeReference = (index: number) => {
    setForm((current) => ({
      ...current,
      references: current.references.filter((_, position) => position !== index),
    }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});

    const nextErrors: Record<string, string> = {};
    if (form.fullName.trim().length < 2) nextErrors.fullName = 'El nombre es obligatorio';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = 'Correo inválido';
    if (form.references.some((reference) => !reference.name.trim())) {
      nextErrors.references = 'Cada referencia necesita un nombre';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        identification: form.identification.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
        references: form.references.map((reference) => ({
          name: reference.name.trim(),
          phone: reference.phone?.trim() || undefined,
          relationship: reference.relationship?.trim() || undefined,
          address: reference.address?.trim() || undefined,
        })),
      };

      if (client) {
        await api.patch(`/api/clients/${client.id}`, payload);
        toast.success('Cliente actualizado.');
        onSaved(client.id);
      } else {
        const response = await api.post<{ clientId: string }>('/api/clients', payload);
        toast.success('Cliente registrado.');
        onSaved(response.clientId);
      }
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
      title={client ? 'Editar cliente' : 'Nuevo cliente'}
      subtitle={client ? client.code : 'Registra los datos básicos para iniciar su expediente.'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={saving}>
            {client ? 'Guardar cambios' : 'Registrar cliente'}
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={onSubmit} noValidate>
        <div className="field-grid">
          <Input
            label="Nombre completo"
            required
            value={form.fullName}
            error={errors.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            placeholder="María López"
          />
          <Input
            label="Identificación"
            value={form.identification}
            onChange={(event) => setForm({ ...form, identification: event.target.value })}
            placeholder="001-123456-0001A"
            hint="Cédula, RUC o pasaporte"
          />
        </div>

        <div className="field-grid">
          <Input
            label="Teléfono"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder="+505 8888 8888"
          />
          <Input
            label="Correo"
            type="email"
            value={form.email}
            error={errors.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="cliente@correo.com"
          />
        </div>

        <Input
          label="Dirección"
          value={form.address}
          onChange={(event) => setForm({ ...form, address: event.target.value })}
          placeholder="Barrio, municipio, referencias"
        />

        <Field
          label="Referencias personales"
          hint="Personas que puedan dar referencia del cliente."
          error={errors.references}
        >
          {() => (
            <div className="stack" style={{ gap: '0.6rem' }}>
              {form.references.map((reference, index) => (
                <div key={index} className="field-grid-3" style={{ alignItems: 'end' }}>
                  <Input
                    label="Nombre"
                    value={reference.name}
                    onChange={(event) => updateReference(index, { name: event.target.value })}
                  />
                  <Input
                    label="Teléfono"
                    value={reference.phone ?? ''}
                    onChange={(event) => updateReference(index, { phone: event.target.value })}
                  />
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'end' }}>
                    <Input
                      label="Relación"
                      value={reference.relationship ?? ''}
                      onChange={(event) => updateReference(index, { relationship: event.target.value })}
                      fieldClassName="grow"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeReference(index)}
                      aria-label="Quitar referencia"
                      style={{ marginBottom: 2 }}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={addReference}>
                Agregar referencia
              </Button>
            </div>
          )}
        </Field>

        <div className="field-grid">
          <Select
            label="Estado"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as FormState['status'] })}
            options={[
              { value: 'active', label: 'Activo' },
              { value: 'inactive', label: 'Inactivo' },
              { value: 'blocked', label: 'Bloqueado' },
            ]}
          />
        </div>

        <Textarea
          label="Notas internas"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Solo visible para tu equipo."
        />

        <button type="submit" className="visually-hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Modal>
  );
}
