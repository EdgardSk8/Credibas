import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Mail } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Checkbox, Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { api, errorMessage } from '../../lib/api';

export function RegisterPage() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    if (form.fullName.trim().length < 2) nextErrors.fullName = 'Ingresa tu nombre completo';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = 'Ingresa un correo válido';
    if (form.password.length < 10) nextErrors.password = 'Usa al menos 10 caracteres';
    else if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(form.password) || !/\d/.test(form.password)) {
      nextErrors.password = 'Incluye al menos una letra y un número';
    }
    if (form.confirm !== form.password) nextErrors.confirm = 'Las contraseñas no coinciden';
    if (!acceptTerms) nextErrors.terms = 'Debes aceptar los términos';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/register', {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        acceptTerms: true,
      });
      setDone(true);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title="Revisa tu correo"
        subtitle="Enviamos un enlace para confirmar tu cuenta."
        footer={
          <>
            ¿Ya confirmaste? <Link to="/login" className="link">Inicia sesión</Link>
          </>
        }
      >
        <div className="alert alert-accent" style={{ display: 'grid', gap: '0.5rem' }}>
          <span className="row" style={{ gap: '0.5rem', fontWeight: 700 }}>
            <Mail size={16} />
            {form.email}
          </span>
          <span>
            El enlace expira en 24 horas y solo puede usarse una vez. Si no lo encuentras, revisa la carpeta de spam.
          </span>
        </div>
        <div className="row" style={{ gap: '0.5rem', color: 'var(--accent)', fontSize: 'var(--text-sm)' }}>
          <CheckCircle2 size={16} />
          Confirmar tu correo es obligatorio para ingresar.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle="14 días de prueba. Sin tarjeta obligatoria."
      footer={
        <>
          ¿Ya tienes cuenta? <Link to="/login" className="link">Inicia sesión</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError && (
          <div className="alert alert-danger">
            <span>{formError}</span>
          </div>
        )}

        <Input
          label="Nombre completo"
          required
          autoComplete="name"
          value={form.fullName}
          error={errors.fullName}
          onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          placeholder="María López"
        />

        <Input
          label="Correo electrónico"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          error={errors.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          placeholder="tu@negocio.com"
        />

        <div className="field-grid">
          <Input
            label="Contraseña"
            type="password"
            required
            autoComplete="new-password"
            value={form.password}
            error={errors.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="Mínimo 10 caracteres"
            hint="Al menos una letra y un número"
          />
          <Input
            label="Confirmar contraseña"
            type="password"
            required
            autoComplete="new-password"
            value={form.confirm}
            error={errors.confirm}
            onChange={(event) => setForm({ ...form, confirm: event.target.value })}
          />
        </div>

        <Checkbox
          label={
            <>
              Acepto los <Link to="/terminos" className="link">términos de servicio</Link> y la{' '}
              <Link to="/privacidad" className="link">política de privacidad</Link>.
            </>
          }
          checked={acceptTerms}
          onChange={(event) => setAcceptTerms(event.target.checked)}
        />
        {errors.terms && <span className="field-error">{errors.terms}</span>}

        <Button type="submit" variant="primary" block size="lg" loading={loading}>
          Crear cuenta
        </Button>
      </form>
    </AuthShell>
  );
}
