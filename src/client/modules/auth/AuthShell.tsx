import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Wallet, CalendarClock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '../../components/brand/Logo';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Link to="/" aria-label="Credibas, inicio">
          <Logo size={30} wordmarkSize={21} />
        </Link>

        <div className="auth-aside-copy">
          <span className="eyebrow">Credibas</span>
          <h2>Tu cartera, con números que puedes defender.</h2>
          <p>
            Controla préstamos, cuotas y cobros en un solo lugar. Cada operación queda registrada, cada pago deja rastro
            y cada reporte se calcula con datos reales.
          </p>

          <div className="auth-steps">
            <div className="auth-step">
              <i>
                <Wallet size={11} />
              </i>
              <span>Crea préstamos con calendario verificable y tasas claras.</span>
            </div>
            <div className="auth-step">
              <i>
                <CalendarClock size={11} />
              </i>
              <span>Controla vencimientos, pagos parciales y mora sin hojas sueltas.</span>
            </div>
            <div className="auth-step">
              <i>
                <ShieldCheck size={11} />
              </i>
              <span>Tu información está aislada de otros negocios y auditada.</span>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          © {new Date().getFullYear()} Credibas · Gestión profesional de créditos
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <Link to="/" className="row" style={{ gap: '0.4rem', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
            <ArrowLeft size={14} />
            Volver al sitio
          </Link>

          <div className="auth-card-header">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          {children}

          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
