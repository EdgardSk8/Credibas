import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Check,
  ClipboardList,
  FileBarChart,
  Landmark,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';

const modules = [
  {
    icon: Users,
    title: 'Clientes',
    description: 'Expediente completo con identificación, contactos, referencias, notas y documentos adjuntos.',
    points: ['Búsqueda y filtros', 'Historial de préstamos y pagos', 'Estado del cliente', 'Exportación CSV'],
  },
  {
    icon: Wallet,
    title: 'Préstamos',
    description: 'Motor financiero propio con interés plano, cuota fija y saldo insoluto.',
    points: ['Frecuencia diaria a mensual', 'Calendario verificable', 'Comisiones y mora', 'Reestructuración auditada'],
  },
  {
    icon: CalendarClock,
    title: 'Cuotas',
    description: 'Calendario generado automáticamente con estados claros y saldo pendiente por cuota.',
    points: ['Pendiente, parcial, pagada, vencida', 'Mora acumulada', 'Filtros por fecha', 'Vista por cliente'],
  },
  {
    icon: Banknote,
    title: 'Pagos',
    description: 'Distribución automática entre mora, interés, capital y comisión con trazabilidad total.',
    points: ['Pagos parciales', 'Abonos a capital', 'Reversión con motivo', 'Comprobante por correo'],
  },
  {
    icon: ClipboardList,
    title: 'Cobros',
    description: 'Agenda de cobro, asignación de cobradores y seguimiento de promesas de pago.',
    points: ['Cuotas vencidas y próximas', 'Gestiones y resultados', 'Promesas con fecha', 'Seguimiento por cobrador'],
  },
  {
    icon: Landmark,
    title: 'Caja',
    description: 'Control de efectivo con apertura, cierre, arqueo y movimientos vinculados a su origen.',
    points: ['Ingresos y egresos', 'Diferencia de arqueo', 'Movimientos automáticos por pago', 'Historial completo'],
  },
  {
    icon: FileBarChart,
    title: 'Reportes',
    description: 'Cartera, morosidad, envejecimiento de saldos, intereses y flujo de caja.',
    points: ['Morosidad real', 'Aging de cartera', 'Pagos por período', 'Exportación CSV'],
  },
  {
    icon: SlidersHorizontal,
    title: 'Configuración',
    description: 'Datos del negocio, monedas, políticas de mora, orden de distribución y usuarios.',
    points: ['NIO y USD', 'Orden de aplicación de pagos', 'Roles y permisos', 'Período de gracia'],
  },
];

export function FeaturesPage() {
  return (
    <>
      <section className="hero" style={{ paddingBottom: '2rem' }}>
        <div className="container">
          <div className="hero-copy" style={{ maxWidth: '760px' }}>
            <span className="eyebrow">Funcionalidades</span>
            <h1 style={{ fontSize: 'clamp(2.2rem, 4.4vw, 3.4rem)' }}>
              Todo lo que tu negocio financiero necesita, <em>sin piezas sueltas</em>
            </h1>
            <p className="hero-sub">
              Credibas conecta clientes, préstamos, cuotas, pagos, cobros, caja y reportes en un solo sistema. Cada
              módulo comparte la misma información, así que tus números siempre coinciden.
            </p>
            <div className="hero-actions">
              <Link to="/registro">
                <Button variant="primary" size="lg">
                  Probar 15 días
                  <ArrowRight size={17} />
                </Button>
              </Link>
              <Link to="/precios">
                <Button variant="secondary" size="lg">
                  Ver precios
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 'var(--space-16)' }}>
        <div className="bento">
          {modules.map((module) => (
            <article className="bento-item bento-span-6" key={module.title}>
              <div className="bento-icon">
                <module.icon size={18} />
              </div>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <ul className="check-list">
                {module.points.map((point) => (
                  <li key={point}>
                    <Check size={14} /> {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 'var(--space-16)' }}>
        <div className="cta-band">
          <span className="eyebrow">
            <ShieldCheck size={14} /> Confianza operativa
          </span>
          <h2>Diseñado para que los números cuadren</h2>
          <p>
            Cálculos en centavos, redondeo explícito, transacciones atómicas en las operaciones financieras y un
            registro de auditoría que conserva qué pasó, quién lo hizo y cuándo.
          </p>
          <Link to="/registro">
            <Button variant="primary" size="lg">
              Crear cuenta
              <ArrowRight size={17} />
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}
