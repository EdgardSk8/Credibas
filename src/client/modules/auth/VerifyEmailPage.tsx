import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { me } = useAuth();
  const [email, setEmail] = useState(searchParams.get('email') ?? me?.user.email ?? '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.replace(/\D/g, '').slice(0, 6);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Ingresa el correo con el que te registraste.');
      return;
    }
    if (normalizedCode.length !== 6) {
      setError('El código debe tener 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/verify-email-code', { email: normalizedEmail, code: normalizedCode });
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Ingresa el correo con el que te registraste.');
      return;
    }

    setResending(true);
    try {
      await api.post('/api/auth/resend-verification', { email: normalizedEmail });
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice('Si el correo necesita confirmación, enviamos un nuevo código.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title="Verificación de correo"
      subtitle="Ingresa el código de 6 dígitos que enviamos a tu correo."
      footer={
        <>
          ¿Ya está confirmado? <Link to="/login" className="link">Inicia sesión</Link>
        </>
      }
    >
      {done ? (
        <div className="stack">
          <div className="alert alert-accent">
            <CheckCircle2 size={18} color="var(--accent)" />
            <span>Correo confirmado. Ya puedes iniciar sesión.</span>
          </div>
          <Link to="/login">
            <Button variant="primary" block size="lg">
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
          {notice && (
            <div className="alert alert-accent">
              <span>{notice}</span>
            </div>
          )}

          <Input
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@negocio.com"
          />

          <Input
            label="Código de verificación"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            fieldClassName="code-field"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            hint="Expira en 10 minutos"
          />

          <Button type="submit" variant="primary" block size="lg" loading={loading}>
            Confirmar correo
          </Button>

          <Button
            type="button"
            variant="secondary"
            block
            onClick={resend}
            loading={resending}
            disabled={cooldown > 0 || resending}
          >
            {cooldown > 0 ? `Reenviar código en ${cooldown}s` : 'Reenviar código'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
