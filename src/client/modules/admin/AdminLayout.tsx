import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, CreditCard, LayoutDashboard, LogOut, ArrowLeft, Shield } from 'lucide-react';
import { Logo } from '../../components/brand/Logo';
import { useAuth } from '../../hooks/useAuth';
import { initials } from '../../lib/format';

const links = [
  { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/admin/organizaciones', label: 'Organizaciones', icon: Building2, end: false },
  { to: '/admin/planes', label: 'Planes', icon: CreditCard, end: false },
];

export function AdminLayout() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <Link to="/admin" aria-label="Credibas administración">
            <Logo size={26} wordmarkSize={19} />
          </Link>
          <span className="badge badge-accent">
            <Shield size={11} />
            Admin
          </span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">Plataforma</div>
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
          <div className="sidebar-section">Acceso</div>
          <Link to="/app" className="sidebar-link">
            <ArrowLeft size={17} />
            Volver a la aplicación
          </Link>
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="avatar">{initials(me?.user.fullName ?? 'A')}</span>
            <span className="sidebar-user-meta">
              <strong>{me?.user.fullName}</strong>
              <span>{me?.user.email}</span>
            </span>
          </div>
          <button
            type="button"
            className="sidebar-link"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogOut size={17} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-title">
            <strong>Administración de Credibas</strong>
            <span>Operación global de la plataforma</span>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
