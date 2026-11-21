import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { PlanSummary } from '@shared/types';
import { money } from '../../lib/format';
import { Button } from '../ui/Button';

const FEATURED = new Set(['professional']);

function limitLabel(plan: PlanSummary): string {
  const users = plan.limits.users;
  const loans = plan.limits.active_loans;
  if (users && loans) return `${users} usuario${users > 1 ? 's' : ''} · ${loans.toLocaleString('es-NI')} préstamos activos`;
  return '';
}

export function PlanCard({ plan, cta = 'Comenzar prueba' }: { plan: PlanSummary; cta?: string }) {
  const featured = FEATURED.has(plan.key);

  return (
    <article className={`price-card ${featured ? 'is-featured' : ''}`}>
      {featured && <span className="price-badge">Más elegido</span>}
      <div>
        <div className="price-name">{plan.name}</div>
        <p className="price-desc">{plan.description}</p>
      </div>

      <div className="price-amount">
        <strong>{money(plan.priceMonthlyCents, 'USD')}</strong>
        <span>/ mes</span>
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: '-0.6rem' }}>
        o {money(plan.priceYearlyCents, 'USD')} al año · {plan.trialDays} días de prueba
      </p>

      <ul className="price-features">
        {plan.features.map((feature) => (
          <li key={feature}>
            <Check size={14} />
            {feature}
          </li>
        ))}
      </ul>

      {limitLabel(plan) && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{limitLabel(plan)}</p>
      )}

      <Link to="/registro" style={{ marginTop: 'auto' }}>
        <Button variant={featured ? 'primary' : 'secondary'} block>
          {cta}
        </Button>
      </Link>
    </article>
  );
}
