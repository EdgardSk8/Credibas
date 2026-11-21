import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { api, errorMessage } from '../../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Ingresa un correo válido');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Recupera tu acceso"
      subtitle="Te enviaremos un enlace seguro para restablecer tu contraseña."
      footer={
        <>
          ¿Ya la recordaste? <Link to="/login" className="link">Inicia sesión</Link>
        </>
      }
    >
      {sent ? (
        <div className="stack">
          <div className="alert alert-accent">
            <Mail size={17} />
            <span>
              Si <strong>{email}</strong> tiene una cuenta, enviamos instrucciones. El enlace expira en 1 hora.
            </span>
          </div>
          <p className="field-hint">
            Por seguridad no confirmamos si el correo existe. Revisa spam si no lo ves en unos minutos.
          </p>
          <Link to="/login">
            <Button variant="secondary" block>
              Volver al inicio de sesión
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
          <Input
            label="Correo electrónico"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@negocio.com"
          />
          <Button type="submit" variant="primary" block size="lg" loading={loading}>
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
