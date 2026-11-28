import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Check, Globe2, Sparkles } from 'lucide-react';
import { Logo } from '../../components/brand/Logo';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toasts';

const currencies = [
  { value: 'NIO', label: 'Córdoba nicaragüense (NIO)' },
  { value: 'USD', label: 'Dólar estadounidense (USD)' },
];

const timezones = [
  { value: 'America/Managua', label: 'Managua (GMT-6)' },
  { value: 'America/Guatemala', label: 'Guatemala (GMT-6)' },
  { value: 'America/Tegucigalpa', label: 'Tegucigalpa (GMT-6)' },
  { value: 'America/El_Salvador', label: 'San Salvador (GMT-6)' },
  { value: 'America/Costa_Rica', label: 'San José (GMT-6)' },
  { value: 'America/Panama', label: 'Panamá (GMT-5)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
  { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
  { value: 'America/Lima', label: 'Lima (GMT-5)' },
  { value: 'America/Santiago', label: 'Santiago (GMT-3/-4)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const toast = useToast();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('NIO');
  const [timezone, setTimezone] = useState('America/Managua');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('Escribe el nombre de tu negocio.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/organizations', { name: name.trim(), currency, timezone });
      await queryClient.invalidateQueries();
      toast.success('Negocio creado. Bienvenido a Credibas.');
      navigate('/app', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const hasOrg = Boolean(me?.activeOrgId);

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Link to="/" aria-label="Credibas">
          <Logo size={30} wordmarkSize={21} />
        </Link>

        <div className="auth-aside-copy">
          <span className="eyebrow">Último paso</span>
          <h2>Configura tu negocio y empieza a operar.</h2>
          <p>
            Tu negocio es un espacio independiente: clientes, préstamos, pagos y usuarios solo existen dentro de esta
            organización.
          </p>

          <div className="auth-steps">
            <div className="auth-step">
              <i>
                <Building2 size={11} />
              </i>
              <span>Nombre comercial y moneda principal.</span>
            </div>
            <div className="auth-step">
              <i>
                <Globe2 size={11} />
              </i>
              <span>Zona horaria para vencimientos y cobros del día.</span>
            </div>
            <div className="auth-step">
              <i>
                <Check size={11} />
              </i>
              <span>15 días de prueba con límites iniciales.</span>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          Podrás invitar a tu equipo después de crear el negocio.
        </p>
      </aside>

      <main className="auth-main">
        <div className="onboarding">
          <div className="onboarding-steps">
            <i className="active" />
            <span>Negocio</span>
            <i />
            <span>Equipo</span>
            <i />
            <span>Primer cliente</span>
          </div>

          <div className="card" style={{ padding: 'var(--space-8)' }}>
            <div className="stack" style={{ marginBottom: 'var(--space-6)' }}>
              <h1 style={{ fontSize: '1.8rem' }}>Crea tu negocio</h1>
              <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                {hasOrg
                  ? 'Puedes crear otro negocio. Tu sesión cambiará automáticamente a la nueva organización.'
                  : 'Esta información aparecerá en tus comprobantes y reportes.'}
              </p>
            </div>

            {error && (
              <div className="alert alert-danger" style={{ marginBottom: 'var(--space-4)' }}>
                <span>{error}</span>
              </div>
            )}

            <form className="stack" onSubmit={onSubmit} noValidate>
              <Input
                label="Nombre del negocio"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Financiera El Buen Crédito"
                autoFocus
              />

              <div className="field-grid">
                <Select
                  label="Moneda principal"
                  required
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  options={currencies}
                  hint="Puedes operar también en la otra moneda y los reportes se separan."
                />
                <Select
                  label="Zona horaria"
                  required
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  options={timezones}
                />
              </div>

              <div className="alert alert-accent">
                <Sparkles size={17} />
                <span>
                  Empezarás en el plan de prueba por 15 días: hasta 1 usuario, 50 clientes y 25 préstamos activos.
                </span>
              </div>

              <Button type="submit" variant="primary" size="lg" block loading={loading}>
                Crear negocio y entrar
                <ArrowRight size={17} />
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
