import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Logo } from '../brand/Logo';
import { Button } from '../ui/Button';

const navigation = [
  { label: 'Funcionalidades', to: '/funcionalidades' },
  { label: 'Cómo funciona', to: '/#como-funciona' },
  { label: 'Precios', to: '/precios' },
  { label: 'Preguntas', to: '/#faq' },
  { label: 'Contacto', to: '/contacto' },
];

function ScrollToHash() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.slice(1));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname, location.hash]);

  return null;
}

export function PublicLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <div className="public-shell">
      <ScrollToHash />
      <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="container site-nav">
          <Link to="/" aria-label="Credibas, inicio">
            <Logo size={30} wordmarkSize={21} />
          </Link>

          <nav className="site-nav-links" aria-label="Navegación principal">
            {navigation.map((item) =>
              item.to.startsWith('/#') ? (
                <a key={item.label} href={item.to}>
                  {item.label}
                </a>
              ) : (
                <NavLink key={item.label} to={item.to} aria-current={location.pathname === item.to ? 'page' : undefined}>
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>

          <div className="site-nav-actions">
            <Link to="/login" className="btn btn-ghost">
              Iniciar sesión
            </Link>
            <Link to="/registro">
              <Button variant="primary">
                Crear cuenta
                <ArrowUpRight size={15} />
              </Button>
            </Link>
            <button
              type="button"
              className="icon-button nav-toggle"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <div className="mobile-nav" data-open={mobileOpen}>
          <div className="container">
            <ul>
              {navigation.map((item) => (
                <li key={item.label}>
                  <a href={item.to}>{item.label}</a>
                </li>
              ))}
              <li>
                <Link to="/login">Iniciar sesión</Link>
              </li>
              <li>
                <Link to="/registro">Crear cuenta</Link>
              </li>
            </ul>
          </div>
        </div>
      </header>

      <main className="public-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <Logo size={28} wordmarkSize={20} />
              <p>
                Plataforma para administrar préstamos, clientes, cuotas y cobros. Diseñada para negocios financieros que
                quieren operar con orden y control.
              </p>
            </div>

            <div className="footer-col">
              <h4>Producto</h4>
              <ul>
                <li>
                  <Link to="/funcionalidades">Funcionalidades</Link>
                </li>
                <li>
                  <Link to="/precios">Planes y precios</Link>
                </li>
                <li>
                  <Link to="/#como-funciona">Cómo funciona</Link>
                </li>
                <li>
                  <Link to="/contacto">Solicitar demo</Link>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Cuenta</h4>
              <ul>
                <li>
                  <Link to="/registro">Crear cuenta</Link>
                </li>
                <li>
                  <Link to="/login">Iniciar sesión</Link>
                </li>
                <li>
                  <Link to="/recuperar-contrasena">Recuperar acceso</Link>
                </li>
                <li>
                  <Link to="/verificar-correo">Verificar correo</Link>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Legal</h4>
              <ul>
                <li>
                  <Link to="/terminos">Términos de servicio</Link>
                </li>
                <li>
                  <Link to="/privacidad">Política de privacidad</Link>
                </li>
                <li>
                  <a href="mailto:tellezsoftware@gmail.com">tellezsoftware@gmail.com</a>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Credibas. Todos los derechos reservados.</span>
            <span className="footer-status">
              <ShieldCheck size={14} />
              Datos cifrados en tránsito · Operación multi-negocio aislada
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
