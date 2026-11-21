# Credibas

Plataforma SaaS para administrar préstamos, clientes, cuotas, pagos, cobros y caja. Construida para negocios financieros que necesitan control real de su cartera, con aislamiento por organización, auditoría y un motor financiero verificable.

> Estado: **fundación funcional (v0.1.0)**. Website pública, autenticación, multi-tenancy, clientes, préstamos, cuotas, pagos, cobros, caja, reportes, suscripciones y panel de plataforma implementados y probados localmente. La integración con Cloudflare (D1/R2/Queues) está configurada en `wrangler.jsonc`; falta crear los recursos reales y desplegar.

---

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | React 19 + TypeScript + Vite 8 (SPA) |
| Estilos | CSS modular por capas (tokens, base, componentes, layout, páginas) |
| Backend | Cloudflare Workers + Hono 4 |
| Base de datos | Cloudflare D1 (SQLite) con migraciones versionadas |
| Archivos | Cloudflare R2 |
| Asíncrono | Cloudflare Queues + Cron Triggers |
| Validación | Zod 4 (esquemas compartidos cliente/servidor) |
| Cálculos | TypeScript propio + `decimal.js` para aritmética decimal |
| Pruebas | Vitest 4 + `@cloudflare/vitest-plugin` (runtime real de Workers) |
| Iconos | Lucide |
| Tipografía | Sora (display) + Manrope (UI), autoalojadas |

## Estructura

```
src/
  client/                 Aplicación React
    app/                  Router y guardas
    components/           ui, layout, brand, marketing, tables
    modules/              auth, public, dashboard, clients, loans, installments,
                          payments, collections, cash, reports, settings,
                          subscriptions, admin
    hooks/ lib/ styles/   Sesión, API, formato y sistema visual
  shared/                 Código compartido cliente + worker
    finance/              Motor financiero puro (fechas, dinero, calendario, mora, pagos)
    rbac.ts               Permisos y plantillas de roles
    validation.ts         Esquemas Zod
    types.ts              Contratos de API
  worker/                 API
    routes/               Módulos REST
    middleware/           Sesión, organización activa, permisos, CSRF, errores
    services/             Autenticación, límites, préstamos, pagos, correo, Turnstile
    repositories/         Acceso a D1 (todas las consultas con org_id)
    jobs/                 Consumidor de cola y Cron
migrations/               0001_core.sql, 0002_seed.sql
tests/                    unit (motor financiero) y worker (integración multi-tenant)
docs/                     Documentación técnica
```

## Inicio rápido

Requisitos: Node 22+, npm 11+.

```bash
npm install
npm run dev
```

La primera vez, aplica las migraciones a la base local:

```bash
npm run db:migrate:local
```

Abre `http://localhost:5173`. El correo se imprime en la consola del servidor (proveedor `console`), así que puedes copiar el enlace de verificación desde la terminal.

### Scripts

| Script | Propósito |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (Vite + Worker en workerd) |
| `npm run build` | Typecheck + build de cliente y worker |
| `npm run typecheck` | Verificación estricta de TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Pruebas unitarias e integración en el runtime de Workers |
| `npm run preview` | Vista previa del build |
| `npm run deploy` | Build + despliegue a Cloudflare |
| `npm run db:migrate:local` | Aplica migraciones a D1 local |
| `npm run db:migrate:remote` | Aplica migraciones a D1 remoto |
| `npm run db:seed:demo` | Carga datos de demostración (solo local/desarrollo) |

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Base de datos](docs/DATABASE.md)
- [Cálculos financieros](docs/FINANCIAL-CALCULATIONS.md)
- [Seguridad](docs/SECURITY.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Variables de entorno](docs/ENVIRONMENT.md)
- [Suscripciones y planes](docs/SUBSCRIPTIONS.md)
- [Cambios](docs/CHANGELOG.md)

## Reglas del proyecto

- Todos los importes se calculan y persisten en centavos; las tasas en puntos base.
- Ninguna consulta de negocio puede ejecutarse sin `org_id` resuelto desde la sesión autenticada.
- Los movimientos financieros no se eliminan: se revierten con motivo, responsable y auditoría.
- Los límites de plan viven en la base de datos, no en el código.
- No se incluyen secretos en el repositorio ni datos ficticios en producción.

## Pendiente para producción

Ver [DESPLIEGUE](docs/DEPLOYMENT.md) y [SUSCRIPCIONES](docs/SUBSCRIPTIONS.md) para el detalle. Resumen:

1. Crear recursos reales en Cloudflare (D1, R2, Queues) y reemplazar los IDs de `wrangler.jsonc`.
2. Configurar secretos (`TURNSTILE_SECRET`, `RESEND_API_KEY` o Email Service, `BILLING_WEBHOOK_SECRET`).
3. Integrar un proveedor de pagos compatible con Nicaragua y su webhook firmado.
4. Revisión legal de términos y privacidad.
5. Conectar el repositorio de GitHub y configurar los entornos de despliegue.

