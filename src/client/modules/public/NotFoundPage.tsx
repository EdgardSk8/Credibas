import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Logo } from '../../components/brand/Logo';

export function NotFoundPage() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <div className="stack" style={{ justifyItems: 'center', textAlign: 'center', maxWidth: 460 }}>
        <Logo size={34} wordmarkSize={23} />
        <span className="eyebrow" style={{ marginTop: '1rem' }}>
          Error 404
        </span>
        <h1 style={{ fontSize: '2rem' }}>No encontramos esta página</h1>
        <p className="text-muted">
          Puede que el enlace haya cambiado o que la página ya no exista. Vuelve al inicio y sigue desde ahí.
        </p>
        <div className="row" style={{ gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/">
            <Button variant="primary" icon={<Compass size={16} />}>
              Ir al inicio
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary">Iniciar sesión</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
