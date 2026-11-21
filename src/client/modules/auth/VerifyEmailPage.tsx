import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Button } from '../../components/ui/Button';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

type State = 'idle' | 'loading' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { me } = useAuth();
  const [state, setState] = useState<State>(token ? 'loading' : 'idle');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    const run = async () => {
      try {
        const response = await api.post<{ message: string }>('/api/auth/verify-email', { token });
        setState('success');
        setMessage(response.message ?? 'Correo confirmado.');
      } catch (error) {
        setState('error');
        setMessage(errorMessage(error));
      }
    };

    void run();
  }, [token]);

  const resend = async () => {
    setResending(true);
    try {
      await api.post('/api/auth/resend-verification');
      setResent(true);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title="Verificación de correo"
      subtitle="Confirma tu dirección para activar tu cuenta."
      footer={
        <>
          ¿Ya está confirmado? <Link to="/login" className="link">Inicia sesión</Link>
        </>
      }
    >
      {state === 'loading' && (
        <div className="row" style={{ gap: '0.7rem', color: 'var(--text-muted)' }}>
          <span className="spinner" />
          Confirmando tu correo…
        </div>
      )}

      {state === 'success' && (
        <div className="stack">
          <div className="alert alert-accent">
            <CheckCircle2 size={18} color="var(--accent)" />
            <span>{message}</span>
          </div>
          <Link to="/login">
            <Button variant="primary" block size="lg">
              Iniciar sesión
            </Button>
          </Link>
        </div>
      )}

      {state === 'error' && (
        <div className="stack">
          <div className="alert alert-danger">
            <XCircle size={18} />
            <span>{message || 'El enlace no es válido o expiró.'}</span>
          </div>
          {me && !me.user.emailVerified && (
            <Button variant="secondary" block onClick={resend} loading={resending} disabled={resent}>
              {resent ? 'Enlace enviado' : 'Enviar un nuevo enlace'}
            </Button>
          )}
          <Link to="/recuperar-contrasena">
            <Button variant="ghost" block>
              Recuperar contraseña
            </Button>
          </Link>
        </div>
      )}

      {state === 'idle' && (
        <div className="stack">
          <p className="text-muted">
            Abre el enlace que enviamos a tu correo. Si ya iniciaste sesión y tu correo no está confirmado, puedes
            solicitar un nuevo enlace.
          </p>
          {me && !me.user.emailVerified ? (
            <Button variant="primary" block onClick={resend} loading={resending} disabled={resent}>
              {resent ? 'Enlace enviado' : 'Enviar enlace de verificación'}
            </Button>
          ) : (
            <div className="alert">
              <span>Inicia sesión para reenviar la verificación si la necesitas.</span>
            </div>
          )}
        </div>
      )}

      {message && state !== 'error' && state !== 'success' && (
        <p className="field-hint" style={{ marginTop: 'var(--space-3)' }}>
          {message}
        </p>
      )}
    </AuthShell>
  );
}
