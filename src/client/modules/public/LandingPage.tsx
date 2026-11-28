import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileBarChart,
  HandCoins,
  Landmark,
  Lock,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PlanCard } from '../../components/marketing/PlanCard';
import { usePublicPlans } from '../../hooks/usePlans';
import { useToast } from '../../components/ui/Toasts';
import { api, errorMessage } from '../../lib/api';

const collectionSeries = [
  { label: '28 sep', amount: 6850 },
  { label: '5 oct', amount: 8200 },
  { label: '12 oct', amount: 7400 },
  { label: '19 oct', amount: 10150 },
  { label: '26 oct', amount: 9300 },
  { label: '2 nov', amount: 12600 },
  { label: '9 nov', amount: 11450 },
  { label: '16 nov', amount: 14200 },
];

const collectionMax = Math.max(...collectionSeries.map((item) => item.amount));
const collectionTotal = collectionSeries.reduce((sum, item) => sum + item.amount, 0);

function formatCordobas(value: number): string {
  return `C$ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const faqs = [
  {
    question: '¿Credibas es un sistema de préstamos o un Excel mejorado?',
    answer:
      'Es una plataforma completa: registra clientes, crea préstamos con calendario de cuotas, aplica pagos con distribución automática, controla caja y genera reportes reales de cartera y mora.',
  },
  {
    question: '¿Puedo usarlo si presto en córdobas y dólares?',
    answer:
      'Sí. Cada préstamo y pago conserva su moneda original. Los reportes nunca suman monedas distintas como si fueran iguales; puedes analizar tu cartera por moneda.',
  },
  {
    question: '¿Cómo se calculan las cuotas?',
    answer:
      'El motor financiero soporta interés plano, cuota fija y saldo insoluto, con frecuencias diaria, semanal, quincenal, mensual o personalizada. Todos los importes se calculan en centavos y con reglas de redondeo explícitas.',
  },
  {
    question: '¿Puedo trabajar con cobradores?',
    answer:
      'Sí. Asigna clientes a cobradores, recibe una agenda de cuotas vencidas y próximas, registra gestiones, promesas de pago y da seguimiento desde un solo lugar.',
  },
  {
    question: '¿Qué pasa si necesito reestructurar un préstamo?',
    answer:
      'Credibas nunca reescribe el historial. Genera una nueva versión del calendario sobre el saldo pendiente y deja registro de auditoría de quién lo hizo y por qué.',
  },
  {
    question: '¿Mis datos están aislados de otros negocios?',
    answer:
      'Cada organización es un espacio independiente. La organización activa se resuelve desde tu sesión y membresía autenticada, nunca desde un identificador enviado por el navegador.',
  },
];

export function LandingPage() {
  const { plans } = usePublicPlans();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [demoLoading, setDemoLoading] = useState(false);

  const openDemo = async () => {
    setDemoLoading(true);
    try {
      await api.post('/api/public/demo');
      // La cookie cambia: hay que releer la sesión antes de entrar al panel.
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/app');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Gestión financiera para prestamistas</span>
            <h1>
              Controla tus créditos
              <br />
              <em>Domina tus finanzas</em>
            </h1>
            <p className="hero-sub">
              Registra clientes y préstamos, genera el calendario de cuotas y aplica pagos con distribución automática
              entre mora, interés y capital. Controla caja, cartera y vencimientos; cada operación queda auditada.
            </p>
            <div className="hero-actions">
              <Link to="/registro">
                <Button variant="primary" size="lg">
                  Comenzar gratis
                  <ArrowRight size={17} />
                </Button>
              </Link>
              <Button variant="secondary" size="lg" onClick={openDemo} loading={demoLoading}>
                Ver demo
              </Button>
              <Link to="/funcionalidades">
                <Button variant="ghost" size="lg">
                  Conocer funcionalidades
                </Button>
              </Link>
            </div>
            <div className="hero-trust">
              <span>
                <Check size={14} /> 15 días de prueba
              </span>
              <span>
                <Check size={14} /> Sin tarjeta obligatoria
              </span>
              <span>
                <Check size={14} /> Córdobas y dólares
              </span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="app-mockup" aria-hidden="true">
              <div className="mockup-bar">
                <i />
                <i />
                <i />
              </div>
              <div className="mockup-body">
                <div className="mockup-side">
                  <span className="active" />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="mockup-main">
                  <div className="mockup-kpis">
                    <div className="mockup-kpi">
                      <b />
                      <i />
                    </div>
                    <div className="mockup-kpi">
                      <b />
                      <i />
                    </div>
                    <div className="mockup-kpi">
                      <b />
                      <i />
                    </div>
                  </div>
                  <div className="mockup-chart">
                    {[38, 52, 44, 66, 58, 78, 70, 88, 64, 92, 74, 96].map((height, index) => (
                      <span key={index} style={{ height: `${height}%` }} />
                    ))}
                  </div>
                  <div className="mockup-rows">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-float">
              <strong>Cobrado hoy</strong>
              <span>C$ 18,450.00</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBlock: 'clamp(2.5rem, 5vw, 4rem)' }}>
        <div className="bento" id="beneficios">
          <article className="bento-item bento-span-7 bento-feature">
            <div className="bento-icon">
              <HandCoins size={18} />
            </div>
            <h3>Un préstamo bien creado se cobra mejor</h3>
            <p>
              Define capital, tasa, frecuencia y método de amortización. Credibas genera el calendario completo al
              instante y te muestra el total a pagar antes de desembolsar.
            </p>
            <div className="bento-visual">
              <div className="loan-preview">
                <div className="loan-preview-head">
                  <div className="loan-preview-title">
                    <span className="loan-preview-label">Préstamo personal</span>
                    <strong className="loan-preview-amount">C$ 16,000.00</strong>
                  </div>
                  <span className="loan-preview-badge">4 cuotas · mensual</span>
                </div>
                <div className="mini-table">
                  <div className="mini-table-row head">
                    <span>Cuota</span>
                    <span>Monto</span>
                    <span>Vencimiento</span>
                    <span>Estado</span>
                  </div>
                  {[
                    ['#01', 'C$ 4,250.00', '12 de noviembre de 2026', '12/11/26', 'Pagada'],
                    ['#02', 'C$ 4,250.00', '12 de diciembre de 2026', '12/12/26', 'Pagada'],
                    ['#03', 'C$ 4,250.00', '12 de enero de 2027', '12/01/27', 'Pendiente'],
                    ['#04', 'C$ 4,250.00', '12 de febrero de 2027', '12/02/27', 'Pendiente'],
                  ].map(([numero, monto, vence, venceCorto, estado], index) => (
                    <div className="mini-table-row" key={numero}>
                      <b>{numero}</b>
                      <span className="amount">{monto}</span>
                      <span className="due">
                        <span className="due-largo">{vence}</span>
                        <span className="due-corto">{venceCorto}</span>
                      </span>
                      <span className={index < 2 ? 'status ok' : 'status pending'}>{estado}</span>
                    </div>
                  ))}
                </div>
                <div className="loan-preview-footer">
                  <span>Total a pagar</span>
                  <strong>C$ 17,000.00</strong>
                </div>
              </div>
            </div>
          </article>

          <article className="bento-item bento-span-5">
            <div className="bento-icon">
              <CalendarClock size={18} />
            </div>
            <h3>Cartera y vencimientos en tiempo real</h3>
            <p>
              Conoce tu capital colocado, el recuperado y lo que está por vencer. Sin hojas de cálculo paralelas ni
              cifras desactualizadas.
            </p>
            <div className="bento-visual">
              <div className="chart-head">
                <span>Cobranza · últimas 8 semanas</span>
                <strong>{formatCordobas(collectionTotal)}</strong>
              </div>
              <div
                className="bars"
                role="img"
                aria-label={`Cobranza de las últimas 8 semanas: ${collectionSeries
                  .map((item) => `${item.label}, ${formatCordobas(item.amount)}`)
                  .join('; ')}. Total ${formatCordobas(collectionTotal)}.`}
              >
                {collectionSeries.map((item) => (
                  <div className="bars-bar" key={item.label} title={`${item.label}: ${formatCordobas(item.amount)}`}>
                    <span style={{ height: `${Math.round((item.amount / collectionMax) * 92)}%` }} />
                  </div>
                ))}
              </div>
              <div className="bars-labels">
                {collectionSeries.map((item) => (
                  <span key={item.label}>{item.label}</span>
                ))}
              </div>
            </div>
          </article>

          <article className="bento-item bento-span-5">
            <div className="bento-icon">
              <Users size={18} />
            </div>
            <h3>Equipo con roles claros</h3>
            <p>
              Propietario, administrador, supervisor, cobrador y consulta. Cada persona ve solo lo que su rol permite
              dentro de tu negocio.
            </p>
            <div className="bento-visual">
              <div className="timeline">
                <div className="timeline-step">
                  <i>1</i>
                  <p>
                    <strong>Cobrador</strong> Agenda del día y registro de pagos
                  </p>
                </div>
                <div className="timeline-step">
                  <i>2</i>
                  <p>
                    <strong>Supervisor</strong> Cartera, mora y rendimiento
                  </p>
                </div>
                <div className="timeline-step">
                  <i>3</i>
                  <p>
                    <strong>Propietario</strong> Dinero, plan y decisiones
                  </p>
                </div>
              </div>
            </div>
          </article>

          <article className="bento-item bento-span-7">
            <div className="bento-icon">
              <ReceiptText size={18} />
            </div>
            <h3>Cada pago con su rastro completo</h3>
            <p>
              Los pagos se distribuyen automáticamente entre mora, interés, capital y comisión. Si algo se revierte, se
              revierte con motivo, responsable y auditoría.
            </p>
            <div className="bento-visual">
              <div className="mini-table">
                <div className="mini-table-row head">
                  <span>Componente</span>
                  <span>Aplicado</span>
                  <span>Destino</span>
                </div>
                {[
                  ['Mora', 'C$ 120.00', 'Cuota #03'],
                  ['Interés', 'C$ 850.00', 'Cuota #03'],
                  ['Capital', 'C$ 3,180.00', 'Cuota #03'],
                  ['Comisión', 'C$ 100.00', 'Cuota #03'],
                ].map(([componente, monto, destino]) => (
                  <div className="mini-table-row" key={componente}>
                    <b>{componente}</b>
                    <span>{monto}</span>
                    <span className="ok">{destino}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="section" id="como-funciona">
        <div className="container">
          <div className="section-title">
            <span className="eyebrow">Cómo funciona</span>
            <h2>De la calle al sistema en tres pasos</h2>
            <p>
              Diseñado para operar rápido: lo que un cobrador hace decenas de veces al día debe tomar segundos, no
              minutos.
            </p>
          </div>

          <div className="split">
            <div className="stack">
              <div className="timeline">
                <div className="timeline-step">
                  <i>1</i>
                  <p>
                    <strong>Registra al cliente</strong>
                    Nombre, identificación, teléfono, referencias y documentos en un solo expediente.
                  </p>
                </div>
                <div className="timeline-step">
                  <i>2</i>
                  <p>
                    <strong>Crea el préstamo</strong>
                    Elige monto, tasa, frecuencia y método. Revisa el calendario antes de guardar.
                  </p>
                </div>
                <div className="timeline-step">
                  <i>3</i>
                  <p>
                    <strong>Cobra y sigue</strong>
                    Registra pagos, parciales o abonos a capital. La cartera se actualiza al instante.
                  </p>
                </div>
              </div>
              <Link to="/funcionalidades">
                <Button variant="secondary">
                  Ver todas las funcionalidades
                  <ArrowRight size={15} />
                </Button>
              </Link>
            </div>

            <div className="panel-visual">
              <div className="row-between">
                <div>
                  <div className="card-title">Calendario generado</div>
                  <div className="card-subtitle">C$ 50,000 · 12 cuotas · 4.5% mensual</div>
                </div>
                <span className="badge badge-accent">Cuota fija</span>
              </div>
              <div className="schedule-preview">
                <div className="schedule-preview-row head">
                  <span>#</span>
                  <span>Vence</span>
                  <span>Interés</span>
                  <span>Cuota</span>
                </div>
                {[
                  ['01', '12 nov 2026', 'C$ 2,250', 'C$ 5,660'],
                  ['02', '12 dic 2026', 'C$ 2,109', 'C$ 5,660'],
                  ['03', '12 ene 2027', 'C$ 1,963', 'C$ 5,660'],
                  ['04', '12 feb 2027', 'C$ 1,814', 'C$ 5,660'],
                ].map(([n, vence, interes, cuota]) => (
                  <div className="schedule-preview-row" key={n}>
                    <span>{n}</span>
                    <span>{vence}</span>
                    <span>{interes}</span>
                    <span style={{ color: 'var(--text)' }}>{cuota}</span>
                  </div>
                ))}
              </div>
              <div className="summary-strip" style={{ marginBottom: 0 }}>
                <div>
                  <div className="stat-label">Intereses</div>
                  <div className="numeric" style={{ fontWeight: 600 }}>C$ 17,920</div>
                </div>
                <div>
                  <div className="stat-label">Total a pagar</div>
                  <div className="numeric" style={{ fontWeight: 600, color: 'var(--accent)' }}>C$ 67,920</div>
                </div>
                <div>
                  <div className="stat-label">Saldo final</div>
                  <div className="numeric" style={{ fontWeight: 600 }}>C$ 0.00</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-title">
            <span className="eyebrow">Operación diaria</span>
            <h2>Lo que realmente usas todos los días</h2>
          </div>

          <div className="bento">
            <article className="bento-item bento-span-6">
              <div className="bento-icon">
                <Wallet size={18} />
              </div>
              <h3>Gestión de cartera</h3>
              <p>Capital colocado, recuperado y pendiente por préstamo, cliente y período.</p>
              <ul className="check-list bento-visual">
                <li>
                  <Check size={14} /> Calendario de cuotas verificable
                </li>
                <li>
                  <Check size={14} /> Estados: pendiente, parcial, pagada, vencida
                </li>
                <li>
                  <Check size={14} /> Exportación a CSV para tu contador
                </li>
              </ul>
            </article>

            <article className="bento-item bento-span-6">
              <div className="bento-icon">
                <ClipboardCheck size={18} />
              </div>
              <h3>Control de cuotas y pagos</h3>
              <p>Distribución automática y comprobante por cada cobro registrado.</p>
              <ul className="check-list bento-visual">
                <li>
                  <Check size={14} /> Pagos parciales y anticipados
                </li>
                <li>
                  <Check size={14} /> Abonos a capital con reestructuración
                </li>
                <li>
                  <Check size={14} /> Reversión auditable, nunca borrado
                </li>
              </ul>
            </article>

            <article className="bento-item bento-span-6">
              <div className="bento-icon">
                <FileBarChart size={18} />
              </div>
              <h3>Reportes y estadísticas</h3>
              <p>Morosidad, envejecimiento de cartera, flujo de caja y rendimiento.</p>
              <ul className="check-list bento-visual">
                <li>
                  <Check size={14} /> Aging 1-30, 31-60, 61-90 y 90+
                </li>
                <li>
                  <Check size={14} /> Intereses generados vs. cobrados
                </li>
                <li>
                  <Check size={14} /> Exportación de cartera
                </li>
              </ul>
            </article>

            <article className="bento-item bento-span-6">
              <div className="bento-icon">
                <Landmark size={18} />
              </div>
              <h3>Caja y arqueos</h3>
              <p>Apertura, cierre y movimientos vinculados a su operación de origen.</p>
              <ul className="check-list bento-visual">
                <li>
                  <Check size={14} /> Ingresos y egresos clasificados
                </li>
                <li>
                  <Check size={14} /> Diferencia de arqueo registrada
                </li>
                <li>
                  <Check size={14} /> Historial por cajero
                </li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta-band">
            <span className="eyebrow">Seguridad</span>
            <h2>Tu cartera es información sensible. La tratamos así.</h2>
            <p>
              Aislamiento por organización, permisos por rol, sesiones protegidas, validación en el backend y auditoría
              de operaciones financieras. Los movimientos confirmados no se borran: se revierten con trazabilidad.
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: '1.5rem', fontSize: 'var(--text-sm)' }}>
              <span className="row" style={{ gap: '0.4rem' }}>
                <ShieldCheck size={16} color="var(--accent)" /> Aislamiento multi-negocio
              </span>
              <span className="row" style={{ gap: '0.4rem' }}>
                <Lock size={16} color="var(--accent)" /> Cookies HttpOnly y CSRF
              </span>
              <span className="row" style={{ gap: '0.4rem' }}>
                <BellRing size={16} color="var(--accent)" /> Alertas de vencimiento
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="precios" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-title">
            <span className="eyebrow">Planes</span>
            <h2>Precios que crecen contigo</h2>
            <p>Empieza con una prueba completa. Cambia de plan cuando tu cartera lo pida.</p>
          </div>

          <div className="pricing-grid">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>

          <p className="price-footnote">
            Precios de referencia en USD. Facturación mensual o anual con descuento. Los límites de cada plan se
            muestran dentro de la aplicación.
          </p>
        </div>
      </section>

      <section className="section" id="faq" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-title">
            <span className="eyebrow">Preguntas frecuentes</span>
            <h2>Lo que suelen preguntarnos</h2>
          </div>

          <div className="faq">
            {faqs.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta-band">
            <span className="eyebrow">
              <Sparkles size={14} /> Empieza hoy
            </span>
            <h2>Ordena tu cartera esta semana</h2>
            <p>Crea tu cuenta, registra tu primer cliente y genera tu primer préstamo en minutos.</p>
            <div className="hero-actions">
              <Link to="/registro">
                <Button variant="primary" size="lg">
                  Crear cuenta gratis
                  <ArrowRight size={17} />
                </Button>
              </Link>
              <Link to="/contacto">
                <Button variant="secondary" size="lg">
                  Hablar con el equipo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
