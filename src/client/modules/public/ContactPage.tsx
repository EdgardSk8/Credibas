import { useState } from 'react';
import { Mail, MessageSquare, ShieldCheck, Building2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Field';
import { TurnstileWidget } from '../../components/ui/Turnstile';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../components/ui/Toasts';
import { usePublicConfig } from '../../hooks/usePublicConfig';

export function ContactPage() {
  const toast = useToast();
  const { turnstileSiteKey } = usePublicConfig();
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});

    const nextErrors: Record<string, string> = {};
    if (form.name.trim().length < 2) nextErrors.name = 'Ingresa tu nombre';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = 'Ingresa un correo válido';
    if (form.message.trim().length < 10) nextErrors.message = 'Cuéntanos un poco más';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      toast.error('Completa la verificación anti-bots e intenta de nuevo.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/public/contact', { ...form, turnstileToken: turnstileToken ?? undefined });
      setSent(true);
      toast.success('Mensaje enviado. Te respondemos pronto.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
      if (turnstileSiteKey) {
        setTurnstileToken(null);
        setTurnstileKey((value) => value + 1);
      }
    }
  };

  return (
    <section className="section">
      <div className="container">
        <div className="split">
          <div className="stack">
            <span className="eyebrow">Contacto</span>
            <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Hablemos de tu operación</h1>
            <p className="text-muted" style={{ fontSize: 'var(--text-lg)' }}>
              Cuéntanos cómo trabajas hoy: tipo de cartera, moneda, cantidad de cobradores y qué te gustaría resolver.
              Te respondemos con una propuesta concreta.
            </p>

            <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
              <div className="row" style={{ gap: '0.7rem' }}>
                <span className="bento-icon">
                  <Mail size={16} />
                </span>
                <div>
                  <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>Correo</strong>
                  <a href="mailto:tellezsoftware@gmail.com" className="link">
                    tellezsoftware@gmail.com
                  </a>
                </div>
              </div>
              <div className="row" style={{ gap: '0.7rem' }}>
                <span className="bento-icon">
                  <MessageSquare size={16} />
                </span>
                <div>
                  <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>Soporte</strong>
                  <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                    Lunes a viernes · 8:00 a 17:00 (Managua)
                  </span>
                </div>
              </div>
              <div className="row" style={{ gap: '0.7rem' }}>
                <span className="bento-icon">
                  <Building2 size={16} />
                </span>
                <div>
                  <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>Demos guiadas</strong>
                  <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                    Para equipos de 3 o más personas
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            {sent ? (
              <div className="stack" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
                <span className="bento-icon" style={{ margin: '0 auto' }}>
                  <ShieldCheck size={18} />
                </span>
                <h2 style={{ fontSize: 'var(--text-xl)' }}>Mensaje recibido</h2>
                <p className="text-muted">Gracias por escribirnos. Te responderemos en menos de 24 horas hábiles.</p>
                <Button variant="secondary" onClick={() => { setSent(false); setForm({ name: '', email: '', company: '', message: '' }); }}>
                  Enviar otro mensaje
                </Button>
              </div>
            ) : (
              <form className="stack" onSubmit={onSubmit}>
                <div className="card-header" style={{ marginBottom: 0 }}>
                  <div>
                    <div className="card-title">Escríbenos</div>
                    <div className="card-subtitle">Respondemos personalmente cada mensaje.</div>
                  </div>
                </div>

                <Input
                  label="Nombre completo"
                  required
                  value={form.name}
                  error={errors.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="María López"
                />
                <Input
                  label="Correo"
                  type="email"
                  required
                  value={form.email}
                  error={errors.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="maria@negocio.com"
                />
                <Input
                  label="Negocio"
                  value={form.company}
                  onChange={(event) => setForm({ ...form, company: event.target.value })}
                  placeholder="Financiera El Buen Crédito"
                />
                <Textarea
                  label="¿Qué necesitas resolver?"
                  required
                  value={form.message}
                  error={errors.message}
                  onChange={(event) => setForm({ ...form, message: event.target.value })}
                  placeholder="Presto en córdobas con cuotas semanales, tengo 2 cobradores y quiero controlar la mora..."
                />

                <Button type="submit" variant="primary" loading={loading} block>
                  Enviar mensaje
                </Button>

                {turnstileSiteKey && <TurnstileWidget key={turnstileKey} siteKey={turnstileSiteKey} onToken={setTurnstileToken} />}

                <p className="field-hint" style={{ textAlign: 'center' }}>
                  Al enviar aceptas nuestra política de privacidad.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
