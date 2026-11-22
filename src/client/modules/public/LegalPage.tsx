import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

const termsSections = [
  {
    title: '1. Objeto del servicio',
    body: 'Credibas es una plataforma de software para la administración de préstamos, cartera, cuotas, pagos, cobros y caja. No somos una entidad financiera, no otorgamos préstamos y no intermediamos dinero entre las partes. El negocio que contrata el servicio es el único responsable de sus operaciones financieras, tasas, contratos con clientes y obligaciones regulatorias.',
  },
  {
    title: '2. Cuenta y verificación',
    body: 'Para usar la plataforma debes crear una cuenta con datos veraces y confirmar tu correo electrónico. Eres responsable de mantener la confidencialidad de tus credenciales y de todas las acciones realizadas desde tu cuenta.',
  },
  {
    title: '3. Uso aceptable',
    body: 'Te comprometes a no usar la plataforma para actividades ilícitas, incluidos esquemas de captación irregular de fondos, amenazas, cobros violentos o cualquier uso que vulnere derechos de terceros. Podemos suspender cuentas que representen un riesgo legal, operativo o reputacional.',
  },
  {
    title: '4. Datos de clientes',
    body: 'El negocio es el responsable del tratamiento de los datos personales que registra. Debe contar con la base legal correspondiente y atender solicitudes de sus titulares. Credibas actúa como encargado del tratamiento y aplica medidas técnicas y organizativas razonables.',
  },
  {
    title: '5. Planes, pagos y cancelación',
    body: 'Los planes tienen límites de uso definidos en la aplicación. La activación de un plan de pago requiere confirmación del pago en el backend. Puedes cancelar la renovación en cualquier momento; el acceso se mantiene hasta el final del período pagado y luego la cuenta pasa a modo de consulta y exportación según las políticas del producto.',
  },
  {
    title: '6. Disponibilidad y soporte',
    body: 'Trabajamos para mantener el servicio disponible, pero no garantizamos una disponibilidad ininterrumpida. Las ventanas de mantenimiento se comunicarán cuando impliquen interrupciones relevantes.',
  },
  {
    title: '7. Limitación de responsabilidad',
    body: 'En la medida permitida por la ley, Credibas no responde por lucro cesante ni por decisiones de crédito tomadas por el negocio. El uso de la plataforma no sustituye asesoría legal, contable o financiera profesional.',
  },
  {
    title: '8. Cambios',
    body: 'Podemos actualizar estos términos. Los cambios sustanciales se comunicarán por correo o dentro de la aplicación antes de entrar en vigencia.',
  },
];

const privacySections = [
  {
    title: '1. Datos que tratamos',
    body: 'Datos de cuenta (nombre, correo, contraseña cifrada), datos de la organización, datos de clientes que el negocio registra (identificación, contacto, referencias, notas, documentos), y registros operativos como préstamos, cuotas, pagos, caja y auditoría.',
  },
  {
    title: '2. Finalidad',
    body: 'Prestar el servicio contratado, autenticar usuarios, calcular cuotas e intereses, generar reportes, proteger la plataforma y cumplir obligaciones legales. No vendemos datos personales.',
  },
  {
    title: '3. Base legal y roles',
    body: 'El negocio determina las finalidades de los datos de sus clientes y es su responsable. Credibas trata esos datos por cuenta del negocio y para su propia operación como proveedor del servicio.',
  },
  {
    title: '4. Seguridad',
    body: 'Aplicamos aislamiento por organización, control de acceso por roles, cifrado en tránsito, sesiones protegidas, validación del lado del servidor y auditoría de operaciones. No exponemos información financiera en registros innecesarios.',
  },
  {
    title: '5. Conservación',
    body: 'Conservamos la información mientras la cuenta esté activa y durante los plazos necesarios para obligaciones legales o resolución de disputas. Ciertos registros financieros se conservan por trazabilidad aun después de una reversión.',
  },
  {
    title: '6. Derechos de los titulares',
    body: 'Los titulares pueden solicitar acceso, rectificación o eliminación de sus datos a través del negocio responsable. Credibas apoya al negocio para atender esas solicitudes cuando corresponda.',
  },
  {
    title: '7. Encargados y transferencias',
    body: 'Usamos proveedores de infraestructura (Cloudflare) y de correo transaccional para operar el servicio. Estos proveedores tratan datos bajo contratos que exigen confidencialidad y medidas de seguridad.',
  },
  {
    title: '8. Contacto',
    body: 'Para consultas de privacidad escribe a tellezsoftware@gmail.com.',
  },
];

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const sections = kind === 'terms' ? termsSections : privacySections;
  const title = kind === 'terms' ? 'Términos de servicio' : 'Política de privacidad';

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 820 }}>
        <div className="stack" style={{ marginBottom: 'var(--space-8)' }}>
          <span className="eyebrow">Legal</span>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)' }}>{title}</h1>
          <p className="text-muted">Última actualización: noviembre 2026</p>
          <div className="alert alert-warning">
            <AlertTriangle size={17} />
            <span>
              Este documento es una base operativa y debe ser revisado por asesoría legal antes de su publicación
              definitiva y de la comercialización del servicio.
            </span>
          </div>
        </div>

        <div className="stack" style={{ gap: 'var(--space-6)' }}>
          {sections.map((section) => (
            <article key={section.title} className="stack" style={{ gap: '0.4rem' }}>
              <h2 style={{ fontSize: 'var(--text-lg)' }}>{section.title}</h2>
              <p className="text-muted" style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7 }}>
                {section.body}
              </p>
            </article>
          ))}
        </div>

        <div className="card" style={{ marginTop: 'var(--space-10)' }}>
          <div className="card-title">¿Tienes dudas?</div>
          <p className="card-subtitle" style={{ marginBottom: 'var(--space-3)' }}>
            Escríbenos y te respondemos con claridad.
          </p>
          <Link to="/contacto" className="link">
            Ir a contacto
          </Link>
        </div>
      </div>
    </section>
  );
}
