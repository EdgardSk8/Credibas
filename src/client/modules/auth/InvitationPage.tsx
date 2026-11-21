import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, XCircle } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Button } from '../../components/ui/Button';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';

interface InvitationInfo {
  orgName: string;
  email: string;
}

export function InvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { me, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(token);

  useEffect(() => {
    if (token) {
      sessionStorage.setItem('credibas_invitation_token', token);
      setPendingToken(token);
      return;
    }
    const stored = sessionStorage.getItem('credibas_invitation_token');
    if (stored) setPendingToken(stored);
  }, [token]);

  const invitationQuery = useQuery({
    queryKey: ['invitation', pendingToken],
    queryFn: () => api.get<InvitationInfo>(`/api/auth/invitations/${pendingToken}`),
    enabled: Boolean(pendingToken),
    retry: false,
  });

  const accept = async () => {
    if (!pendingToken) return;
    setAccepting(true);
    setError(null);
    try {
      await api.post('/api/auth/accept-invitation', { token: pendingToken });
      sessionStorage.removeItem('credibas_invitation_token');
      await queryClient.invalidateQueries();
      setAccepted(true);
      toast.success('Te uniste al negocio.');
      navigate('/app', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAccepting(false);
    }
  };

  const nextPath = `/invitacion?token=${encodeURIComponent(pendingToken ?? '')}`;

  return (
    <AuthShell
      title="Invitación a un negocio"
      subtitle="Acepta la invitación para colaborar con este equipo en Credibas."
    >
      {!pendingToken ? (
        <div className="alert alert-danger">
          <XCircle size={18} />
          <span>El enlace no incluye una invitación válida.</span>
        </div>
      ) : invitationQuery.isLoading || loading ? (
        <div className="row" style={{ gap: '0.7rem' }}>
          <span className="spinner" />
          Cargando invitación…
        </div>
      ) : invitationQuery.isError ? (
        <div className="stack">
          <div className="alert alert-danger">
            <XCircle size={18} />
            <span>{errorMessage(invitationQuery.error)}</span>
          </div>
          <Link to="/login">
            <Button variant="secondary" block>
              Ir a iniciar sesión
            </Button>
          </Link>
        </div>
      ) : (
        <div className="stack">
          <div className="alert alert-accent" style={{ display: 'grid', gap: '0.4rem' }}>
            <span className="row" style={{ gap: '0.5rem', fontWeight: 700 }}>
              <Building2 size={16} />
              {invitationQuery.data?.orgName}
            </span>
            <span>
              Invitación para <strong>{invitationQuery.data?.email}</strong>
            </span>
          </div>

          {error && (
            <div className="alert alert-danger">
              <span>{error}</span>
            </div>
          )}

          {!me ? (
            <div className="stack">
              <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                Inicia sesión o crea una cuenta con el correo invitado para aceptar.
              </p>
              <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>
                <Button variant="primary" block size="lg">
                  Iniciar sesión y aceptar
                </Button>
              </Link>
              <Link to={`/registro?next=${encodeURIComponent(nextPath)}`}>
                <Button variant="secondary" block>
                  Crear cuenta nueva
                </Button>
              </Link>
            </div>
          ) : accepted ? (
            <div className="alert alert-accent">
              <CheckCircle2 size={18} color="var(--accent)" />
              <span>Ya formas parte de este negocio.</span>
            </div>
          ) : (
            <Button variant="primary" block size="lg" onClick={accept} loading={accepting}>
              Aceptar invitación
            </Button>
          )}
        </div>
      )}
    </AuthShell>
  );
}
