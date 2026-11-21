import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  Wallet,
  CalendarClock,
  BadgeDollarSign,
  ListChecks,
  Landmark,
  BarChart3,
  Settings,
  CreditCard,
  Calculator,
  Bell,
  LogOut,
  ChevronsUpDown,
  Menu,
  Shield,
  Check,
} from 'lucide-react';
import { Logo, LogoMark } from '../brand/Logo';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { initials, relativeTime } from '../../lib/format';
import { PERMISSIONS } from '@shared/rbac';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
}

interface NotificationResponse {
  unread: number;
  items: NotificationItem[];
}

const pageTitles: Array<{ match: RegExp; title: string; subtitle: string }> = [
  { match: /^\/app$/, title: 'Panel general', subtitle: 'Resumen operativo de tu cartera' },
  { match: /^\/app\/clientes\/[^/]+$/, title: 'Detalle del cliente', subtitle: 'Historial crediticio y documentos' },
  { match: /^\/app\/clientes$/, title: 'Clientes', subtitle: 'Registro y seguimiento de clientes' },
  { match: /^\/app\/prestamos\/nuevo$/, title: 'Nuevo préstamo', subtitle: 'Configura el crédito y revisa el calendario' },
  { match: /^\/app\/prestamos\/[^/]+$/, title: 'Detalle del préstamo', subtitle: 'Calendario, pagos y estado' },
  { match: /^\/app\/prestamos$/, title: 'Préstamos', subtitle: 'Cartera colocada y saldos pendientes' },
  { match: /^\/app\/simulador$/, title: 'Simulador de crédito', subtitle: 'Calcula cuotas antes de desembolsar' },
  { match: /^\/app\/cuotas$/, title: 'Cuotas', subtitle: 'Vencimientos y estado de cada cuota' },
  { match: /^\/app\/pagos$/, title: 'Pagos', subtitle: 'Registro y trazabilidad de cobros' },
  { match: /^\/app\/cobros$/, title: 'Gestión de cobros', subtitle: 'Agenda, asignaciones y promesas' },
  { match: /^\/app\/caja$/, title: 'Caja', subtitle: 'Apertura, cierre y movimientos' },
  { match: /^\/app\/reportes$/, title: 'Reportes', subtitle: 'Cartera, mora y flujo de caja' },
  { match: /^\/app\/configuracion$/, title: 'Configuración', subtitle: 'Negocio, usuarios y roles' },
  { match: /^\/app\/suscripcion$/, title: 'Suscripción', subtitle: 'Plan, límites y facturación' },
];

export function AppLayout() {
  const { me, activeMembership, hasPermission, logout, switchOrganization } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const orgMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSidebarOpen(false);
    setOrgMenuOpen(false);
    setUserMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (orgMenuRef.current && !orgMenuRef.current.contains(target)) setOrgMenuOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(target)) setUserMenuOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(target)) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pageInfo = useMemo(() => {
    const found = pageTitles.find((item) => item.match.test(location.pathname));
    return found ?? { title: 'Credibas', subtitle: '' };
  }, [location.pathname]);

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationResponse>('/api/notifications'),
    refetchInterval: 60_000,
  });

  const navSections = useMemo(
    () => [
      {
        label: 'Operación',
        items: [
          { to: '/app', label: 'Panel', icon: LayoutDashboard, permission: null, end: true },
          { to: '/app/clientes', label: 'Clientes', icon: Users, permission: PERMISSIONS.clientsRead },
          { to: '/app/prestamos', label: 'Préstamos', icon: Wallet, permission: PERMISSIONS.loansRead },
          { to: '/app/simulador', label: 'Simulador', icon: Calculator, permission: PERMISSIONS.loansRead },
          { to: '/app/cuotas', label: 'Cuotas', icon: CalendarClock, permission: PERMISSIONS.loansRead },
          { to: '/app/pagos', label: 'Pagos', icon: BadgeDollarSign, permission: PERMISSIONS.paymentsRead },
          { to: '/app/cobros', label: 'Cobros', icon: ListChecks, permission: PERMISSIONS.collectionsRead },
          { to: '/app/caja', label: 'Caja', icon: Landmark, permission: PERMISSIONS.cashRead },
          { to: '/app/reportes', label: 'Reportes', icon: BarChart3, permission: PERMISSIONS.reportsRead },
        ],
      },
      {
        label: 'Negocio',
        items: [
          { to: '/app/configuracion', label: 'Configuración', icon: Settings, permission: PERMISSIONS.orgRead },
          { to: '/app/suscripcion', label: 'Suscripción', icon: CreditCard, permission: PERMISSIONS.billingRead },
        ],
      },
    ],
    [],
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSwitchOrg = async (orgId: string) => {
    await switchOrganization(orgId);
    setOrgMenuOpen(false);
    queryClient.clear();
  };

  const unread = notificationsQuery.data?.unread ?? 0;

  const markAllRead = async () => {
    await api.post('/api/notifications/read-all');
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar" data-open={sidebarOpen}>
        <div className="sidebar-brand">
          <Link to="/app" aria-label="Credibas">
            <Logo size={26} wordmarkSize={19} />
          </Link>
        </div>

        <div className="org-switcher" ref={orgMenuRef}>
          <button
            type="button"
            className="org-switcher-button"
            onClick={() => setOrgMenuOpen((open) => !open)}
            aria-expanded={orgMenuOpen}
          >
            <span className="avatar">{initials(activeMembership?.orgName ?? 'C')}</span>
            <span className="org-switcher-meta">
              <strong>{activeMembership?.orgName ?? 'Mi negocio'}</strong>
              <span>{activeMembership?.roleName ?? 'Propietario'}</span>
            </span>
            <ChevronsUpDown size={15} style={{ marginLeft: 'auto', opacity: 0.5 }} />
          </button>

          {orgMenuOpen && (
            <div className="menu" style={{ left: 0, right: 0 }}>
              {me?.memberships.map((membership) => (
                <button
                  key={membership.orgId}
                  type="button"
                  className="menu-item"
                  onClick={() => handleSwitchOrg(membership.orgId)}
                >
                  <span className="grow" style={{ textAlign: 'left' }}>
                    {membership.orgName}
                  </span>
                  {membership.orgId === me.activeOrgId && <Check size={14} color="var(--accent)" />}
                </button>
              ))}
              {me?.user.isPlatformAdmin && (
                <>
                  <div className="menu-separator" />
                  <Link to="/admin" className="menu-item">
                    <Shield size={14} />
                    Panel de plataforma
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Navegación de la aplicación">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="sidebar-section">{section.label}</div>
              {section.items
                .filter((item) => !item.permission || hasPermission(item.permission))
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={'end' in item ? Boolean(item.end) : false}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}
                  >
                    <item.icon size={17} />
                    {item.label}
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="avatar">{initials(me?.user.fullName ?? 'U')}</span>
            <span className="sidebar-user-meta">
              <strong>{me?.user.fullName}</strong>
              <span>{me?.user.email}</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="sidebar-backdrop" data-open={sidebarOpen} onClick={() => setSidebarOpen(false)} />

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="icon-button sidebar-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Abrir navegación"
          >
            <Menu size={20} />
          </button>

          <div className="app-topbar-title">
            <strong>{pageInfo.title}</strong>
            <span>{pageInfo.subtitle}</span>
          </div>

          <div className="app-topbar-actions">
            <div className="dropdown" ref={notificationsRef}>
              <button
                type="button"
                className="icon-button"
                onClick={() => setNotificationsOpen((open) => !open)}
                aria-label="Notificaciones"
                aria-expanded={notificationsOpen}
              >
                <Bell size={19} />
                {unread > 0 && <span className="count">{unread > 9 ? '9+' : unread}</span>}
              </button>

              {notificationsOpen && (
                <div className="menu" style={{ width: 320, maxHeight: 420, overflowY: 'auto' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.35rem 0.5rem 0.5rem',
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>Notificaciones</strong>
                    <button type="button" className="link" style={{ fontSize: 11 }} onClick={markAllRead}>
                      Marcar leídas
                    </button>
                  </div>
                  {(notificationsQuery.data?.items.length ?? 0) === 0 && (
                    <p style={{ padding: '0.75rem 0.5rem', fontSize: 12, color: 'var(--text-faint)' }}>
                      Sin notificaciones por ahora.
                    </p>
                  )}
                  {notificationsQuery.data?.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '0.5rem',
                        borderTop: '1px solid var(--border)',
                        opacity: item.readAt ? 0.6 : 1,
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: 12.5 }}>{item.title}</strong>
                      {item.body && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{item.body}</span>}
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                        {relativeTime(item.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dropdown" ref={userMenuRef}>
              <button
                type="button"
                className="icon-button"
                onClick={() => setUserMenuOpen((open) => !open)}
                aria-label="Cuenta"
                aria-expanded={userMenuOpen}
              >
                <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                  {initials(me?.user.fullName ?? 'U')}
                </span>
              </button>

              {userMenuOpen && (
                <div className="menu" style={{ width: 230 }}>
                  <div style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--border)' }}>
                    <strong style={{ display: 'block', fontSize: 12.5 }}>{me?.user.fullName}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{me?.user.email}</span>
                  </div>
                  <Link to="/app/configuracion" className="menu-item">
                    <Settings size={14} />
                    Mi cuenta y negocio
                  </Link>
                  {me?.user.isPlatformAdmin && (
                    <Link to="/admin" className="menu-item">
                      <Shield size={14} />
                      Panel de plataforma
                    </Link>
                  )}
                  <div className="menu-separator" />
                  <button type="button" className="menu-item menu-item-danger" onClick={handleLogout}>
                    <LogOut size={14} />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function BrandOnly() {
  return <LogoMark size={22} />;
}
