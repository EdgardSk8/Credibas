import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { PasswordInput } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { api, errorMessage } from '../../lib/api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError('El enlace no incluye un token válido.');
      return;
    }
    if (password.length < 8 || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(password) || !/\d/.test(password)) {
      setError('Usa al menos 8 caracteres con una letra y un número.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Nueva contraseña"
      subtitle="Elige una contraseña segura que no uses en otros servicios."
      footer={
        <>
          ¿Todo listo? <Link to="/login" className="link">Inicia sesión</Link>
        </>
      }
    >
      {!token ? (
        <div className="alert alert-danger">
          <span>El enlace es inválido. Solicita uno nuevo desde la página de recuperación.</span>
        </div>
      ) : done ? (
        <div className="stack">
          <div className="alert alert-accent">
            <CheckCircle2 size={17} color="var(--accent)" />
            <span>Contraseña actualizada. Por seguridad cerramos todas tus sesiones activas.</span>
          </div>
          <Link to="/login">
            <Button variant="primary" block>
              Iniciar sesión
            </Button>
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          {error && (
            <div className="alert alert-danger">
              <span>{error}</span>
            </div>
          )}
          <PasswordInput
            label="Nueva contraseña"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="Mínimo 8 caracteres, una letra y un número"
          />
          <PasswordInput
            label="Confirmar contraseña"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <Button type="submit" variant="primary" block size="lg" loading={loading}>
            Actualizar contraseña
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
