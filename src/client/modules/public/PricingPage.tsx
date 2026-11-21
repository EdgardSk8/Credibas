import { Link } from 'react-router-dom';
import { ArrowRight, Check, Minus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PlanCard } from '../../components/marketing/PlanCard';
import { usePublicPlans } from '../../hooks/usePlans';

const comparisonRows: Array<{ label: string; values: Array<string | boolean> }> = [
  { label: 'Usuarios incluidos', values: ['1', '5', '15'] },
  { label: 'Clientes', values: ['300', '2,000', '10,000'] },
  { label: 'Préstamos activos', values: ['150', '1,000', '5,000'] },
  { label: 'Cobradores', values: [false, true, true] },
  { label: 'Caja y arqueos', values: [false, true, true] },
  { label: 'Reportes avanzados', values: [false, true, true] },
  { label: 'Exportaciones CSV', values: [true, true, true] },
  { label: 'Roles personalizados', values: [false, false, true] },
  { label: 'Sucursales', values: [false, '2', '5'] },
  { label: 'Soporte prioritario', values: [false, false, true] },
];

export function PricingPage() {
  const { plans } = usePublicPlans();

  return (
    <>
      <section className="hero" style={{ paddingBottom: '1.5rem' }}>
        <div className="container">
          <div className="hero-copy" style={{ maxWidth: '720px' }}>
            <span className="eyebrow">Planes y precios</span>
            <h1 style={{ fontSize: 'clamp(2.2rem, 4.4vw, 3.2rem)' }}>
              Un plan para cada tamaño de <em>cartera</em>
            </h1>
            <p className="hero-sub">
              Todos los planes incluyen 14 días de prueba con funcionalidades completas. Sin tarjeta obligatoria para
              comenzar y sin cargos ocultos.
            </p>
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 'var(--space-12)' }}>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
        <p className="price-footnote">
          Los precios se muestran en USD y son hipótesis comerciales sujetas a revisión. Puedes cambiar o cancelar tu
          plan en cualquier momento desde la aplicación.
        </p>
      </section>

      <section className="container" style={{ paddingBottom: 'var(--space-16)' }}>
        <div className="section-title">
          <h2>Comparación de planes</h2>
        </div>

        <div className="comparison">
          <table>
            <thead>
              <tr>
                <th>Característica</th>
                <th>Starter</th>
                <th>Professional</th>
                <th>Business</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {row.values.map((value, index) => (
                    <td key={index}>
                      {value === true ? (
                        <Check size={15} color="var(--accent)" style={{ margin: '0 auto' }} />
                      ) : value === false ? (
                        <Minus size={15} color="var(--text-faint)" style={{ margin: '0 auto' }} />
                      ) : (
                        value
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 'var(--space-16)' }}>
        <div className="split">
          <div className="stack">
            <span className="eyebrow">Facturación</span>
            <h2 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)' }}>Preguntas sobre planes y pagos</h2>
            <p className="text-muted">
              Los planes de pago se activan cuando el pago se confirma en el backend, nunca porque el navegador diga que
              hubo éxito. Aceptamos transferencia y confirmación administrativa mientras habilitamos pasarelas con
              recurrencia.
            </p>
            <Link to="/contacto">
              <Button variant="secondary">
                Consultar facturación
                <ArrowRight size={15} />
              </Button>
            </Link>
          </div>

          <div className="faq">
            <details className="faq-item" open>
              <summary>¿Puedo cambiar de plan cuando quiera?</summary>
              <p>Sí. El cambio se aplica de inmediato y los límites se recalculan con el nuevo plan.</p>
            </details>
            <details className="faq-item">
              <summary>¿Qué pasa si supero un límite?</summary>
              <p>
                La operación que excede el límite se bloquea con un mensaje claro y la opción de actualizar. Nunca se
                borran datos por cambiar de plan.
              </p>
            </details>
            <details className="faq-item">
              <summary>¿Hay descuento anual?</summary>
              <p>Sí. El pago anual equivale a diez meses del plan mensual, con dos meses de ahorro.</p>
            </details>
            <details className="faq-item">
              <summary>¿Puedo cancelar?</summary>
              <p>
                Puedes cancelar la renovación en cualquier momento. Conservas acceso hasta el final del período pagado y
                luego tu cuenta pasa a modo de solo lectura.
              </p>
            </details>
          </div>
        </div>
      </section>
    </>
  );
}
