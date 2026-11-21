import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AuthShell } from './AuthShell';
import { Input, Checkbox } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../components/ui/Toasts';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setNeedsVerification(false);

    const nextErrors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Ingresa un correo válido';
    if (!password) nextErrors.password = 'Ingresa tu contraseña';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/login', { email, password });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Bienvenido de nuevo.');
      navigate(from && from.startsWith('/app') ? from : '/app', { replace: true });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'email_not_verified') {
        setNeedsVerification(true);
        setFormError('Tu correo aún no está confirmado. Revisa tu bandeja de entrada.');
      } else if (code === 'rate_limited' || code === 'tooMany') {
        setFormError(errorMessage(error));
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Bienvenido de nuevo"
      subtitle="Ingresa para continuar administrando tu cartera."
      footer={
        <>
          ¿No tienes cuenta? <Link to="/registro" className="link">Crea una gratis</Link>
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
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          required
          value={email}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="tu@negocio.com"
        />

        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••••"
        />

        <div className="row-between">
          <Checkbox
            label="Mantener sesión iniciada"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <Link to="/recuperar-contrasena" className="link" style={{ fontSize: 'var(--text-sm)' }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button type="submit" variant="primary" block size="lg" loading={loading}>
          Iniciar sesión
        </Button>

        {needsVerification && (
          <p className="field-hint" style={{ textAlign: 'center' }}>
            Si no recibiste el correo, inicia sesión de nuevo más tarde o escríbenos a hola@credibas.app.
          </p>
        )}
      </form>
    </AuthShell>
  );
}
