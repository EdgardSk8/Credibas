# Pagos recurrentes con LAFISE

> **Etapa 1** del brief de integración: análisis de la arquitectura existente y propuesta técnica.
> Fecha: 2026-11-28 · Estado: propuesta aprobable, **sin código nuevo todavía**.

## 0. Veredicto en tres líneas

1. Credibas **ya tiene la mayor parte del brief**: planes, precios, periodicidad, vigencia, tolerancia, facturas, pagos, idempotencia, webhook firmado, cola y cron. No hace falta un sistema paralelo.
2. LAFISE **no publica documentación de API**: `api.lafise.com` existe pero responde `403`, no hay portal de desarrolladores y no hay ninguna integración pública verificable. La **Etapa 4 (adaptador definitivo) está bloqueada** hasta que el banco entregue contrato y credenciales.
3. Lo que sí se puede construir ya, sin depender del banco, es el **motor de cobro recurrente** (método de pago tokenizado, intentos, reintentos, conciliación y avisos) detrás de una interfaz de proveedor intercambiable.

## 1. Verificación de la documentación de LAFISE (2026-11-28)

| Requisito del brief | Estado | Evidencia |
| --- | --- | --- |
| Portal / API pública de pagos | ❌ No localizado | `https://developers.lafise.com` → el host no existe |
| API de cobros | ⚠️ Host existe, acceso cerrado | `https://api.lafise.com` → HTTP `403` |
| Documentación de tokenización | ❌ No verificada | sin documentación pública |
| Cobros recurrentes | ❌ No verificado | — |
| Compatibilidad con NIO | ❌ No verificada | — |
| Webhooks | ❌ No verificado | — |
| Ambiente Sandbox | ❌ No verificado | — |
| Requisitos de afiliación y costos | ❌ No publicados | `www.lafise.com` no tiene sección de comercios ni de pagos |
| Sitio de Nicaragua | ⚠️ Inaccesible desde este entorno | `https://www.lafise.com.ni` → conexión rechazada / DNS |
| Integraciones públicas de referencia | ❌ Ninguna | GitHub: un solo archivo menciona `api.lafise.com` y es una plantilla con marcadores («solo reemplaza los endpoints y credenciales») |

**Conclusión:** no se puede escribir el adaptador real sin inventar endpoints, y el brief lo prohíbe expresamente. Se implementa la interfaz y un adaptador `lafise` que falla de forma explícita y segura mientras no existan credenciales.

## 2. Arquitectura actual (lo que ya existe)

### 2.1 Datos relevantes

| Tabla | Para qué sirve hoy |
| --- | --- |
| `plans`, `plan_limits` | Precio mensual/anual, moneda, días de prueba, días de tolerancia y límites por plan |
| `subscriptions` | Una por organización: plan, ciclo, período vigente, `grace_ends_at`, `cancel_at_period_end` |
| `invoices` | Factura por período (`draft`, `open`, `paid`, `overdue`, `void`) |
| `billing_payments` | Pago con `provider` + `provider_ref` **único** (idempotencia) y comprobante en R2 para transferencias |
| `subscription_requests` | Solicitud de plan del prestamista aprobada o rechazada por el administrador |
| `subscription_modules`, `subscription_addons`, `subscription_change_history` | Configuración efectiva por organización y su bitácora |
| `modules`, `plan_modules`, `addons`, `plan_addons` | Catálogo de módulos, dependencias y complementos |
| `subscription_events`, `audit_logs` | Historial de cambios y auditoría |
| `notifications` | Bandeja interna y correo (`in_app`, `email`) |
| `settings` | Configuración por organización **o global** (`org_id` nulo) |
| `exchange_rates` | Tipo de cambio con fecha de vigencia |

### 2.2 Rutas existentes

- Prestamista: `GET /api/subscriptions/current`, `/invoices`, `/billing-payments`, `/plans`, `/catalog`, `/requests`; `POST /quote`, `/request`, `/start-free`, `/cancel`, `/resume`.
- Administrador (`requireAuth` + `requirePlatformAdmin`): planes, catálogo, `subscription-config` (ver, previsualizar, aplicar), `subscription-requests` (aprobar/rechazar), `billing-payments` (listar, confirmar), `invoice`.
- Webhook: `POST /api/webhooks/billing/:provider` con firma HMAC-SHA256 en `x-credibas-signature`.

### 2.3 Automatización

- Cron `*/15 * * * *`: `refreshExpiredSubscriptions` (pasa a `expired` cuando vence `grace_ends_at`) y recálculo de cuotas vencidas.
- Cron `0 13 * * *`: encola mantenimiento, recordatorios, resumen de mora, limpieza y `billing.expire-subscriptions`.
- Cola `JOBS` con reintento automático a 60 s cuando un job falla.

### 2.4 Seguridad ya presente

- Webhook firmado con `BILLING_WEBHOOK_SECRET`; un mismo `provider_ref` **nunca** se procesa dos veces.
- Rutas administrativas con `requirePlatformAdmin`; facturación con `billing.read` / `billing.manage` (solo el rol `owner` tiene `billing.manage`).
- Todas las consultas de facturación filtran por `org_id`.
- Auditoría y eventos de suscripción en cada cambio sensible.

## 3. Qué del brief ya está resuelto (no duplicar)

| Brief | Cómo se cumple hoy | Estado |
| --- | --- | --- |
| Registrar planes, precios y periodicidad | `plans` + `plan_limits`, editables en `/admin/planes` | ✅ |
| Asignar plan a cada prestamista | `subscriptions` + `/admin/organizations/:id/subscription-config` | ✅ |
| Fecha de vencimiento | `current_period_end` y `grace_ends_at` | ✅ |
| Estados activa / pendiente / vencida / cancelada | `trialing`, `active`, `past_due`, `canceled`, `expired` + solicitudes `pending` | ✅ (mapeo distinto, ver §4) |
| Aplicar las funcionalidades del plan | `modules` → `plan_modules` → `subscription_modules` + límites efectivos | ✅ |
| Historial de pagos | `invoices` + `billing_payments` + `/api/subscriptions/invoices` | ✅ |
| No suspender al primer fallo | `grace_days` por plan y `grace_ends_at` | ✅ |
| Evitar cobros duplicados | índice único `(provider, provider_ref)` | ✅ |
| Cobrar automáticamente con tarjeta | no existe método de pago ni cobro | ❌ (§5) |
| Notificar pagos aprobados y rechazados | canal `notifications` + job `email.send`, sin avisos de cobro | ⚠️ |

## 4. Correcciones al brief (información desalineada)

| El brief dice | En Credibas |
| --- | --- |
| «Plan Básico / Profesional / Empresarial» | Los planes reales son **Gratis, Starter, Professional y Business**, definidos en base de datos y editables desde `/admin/planes`. Los del brief son un ejemplo conceptual. |
| «Registrar planes, precios y periodicidad» | Ya existe; no se crea nada nuevo. |
| «Suscripciones pendientes» | No se añade un estado `pending` a `subscriptions`: la solicitud vive en `subscription_requests` y la deuda en `invoices.status = 'open'`. |
| «Activar o actualizar las funcionalidades permitidas» | No hay indicadores por funcionalidad: se usan **módulos + límites**. Añadir indicadores duplicaría el control de acceso. |
| «Configurar la conexión bancaria» desde la interfaz | Las credenciales **no** se guardan en base de datos: son *secrets* del Worker. La interfaz solo muestra estado y datos no sensibles. |
| «El prestamista registra su tarjeta en el formulario de LAFISE» | Correcto y obligatorio, pero depende de que LAFISE ofrezca ese formulario y la tokenización (no verificado). Mientras tanto **Credibas no pide ningún dato de tarjeta**. |
| «Ambiente Sandbox» | No verificado; no se asume su existencia. |
| «Una sola cuenta de adquirencia» | Coincide con el modelo actual: el banco ve un solo comercio; el multi-inquilino se resuelve en nuestra base de datos con `org_id`. |

## 5. Brechas reales

1. No existe **método de pago** guardado (hoy solo hay comprobantes de transferencia en R2).
2. No hay **intentos de cobro** ni reintentos con espera progresiva.
3. No hay **job de cobro** de suscripciones próximas a vencer.
4. No hay **adaptador de proveedor** ni estado de la integración.
5. El panel administrativo no muestra próximos cobros, intentos fallidos ni conciliación.
6. El prestamista no puede ver ni actualizar su tarjeta (no aplica hasta tener tokenización).
7. `createInvoice` fija el período en 30 días; con planes anuales debe usar el ciclo real.

## 6. Propuesta técnica

### 6.1 Datos: una tabla nueva y columnas, nada más

```sql
CREATE TABLE payment_methods (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,              -- 'lafise'
  provider_token_ref  TEXT NOT NULL,              -- token del banco; nunca el número de tarjeta
  authorization_ref   TEXT,                       -- autorización de cobro recurrente
  brand               TEXT,                       -- visa / mastercard
  last4               TEXT,                       -- últimos cuatro dígitos
  exp_month           INTEGER,
  exp_year            INTEGER,
  holder_name         TEXT,
  status              TEXT NOT NULL CHECK (status IN ('active', 'expired', 'revoked', 'failed')),
  is_default          INTEGER NOT NULL DEFAULT 1 CHECK (is_default IN (0, 1)),
  authorized_at       INTEGER,
  revoked_at          INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_payment_methods_token ON payment_methods (provider, provider_token_ref);
CREATE INDEX ix_payment_methods_org ON payment_methods (org_id, status);
```

- `billing_payments` gana `payment_method_id`, `idempotency_key`, `attempt_no`, `error_code`, `error_message`, `next_retry_at` y `request_json`, con índice único `(provider, idempotency_key)`.
- `subscriptions` gana `payment_method_id` (nulo mientras no haya tarjeta).
- Se reutilizan `invoices`, `billing_payments`, `notifications`, `audit_logs`, `settings`, `subscription_events` y `exchange_rates`. **No** se crean tablas de facturación paralelas.

### 6.2 Adaptador de proveedor

```
src/worker/services/payments/
  types.ts    PaymentProvider: createCardToken, authorizeRecurring,
              revokeAuthorization, charge, getCharge, verifyWebhook
  manual.ts   flujo actual: sin cobro automático, el administrador confirma
  lafise.ts   lanza PaymentProviderUnavailable('lafise_not_configured')
  index.ts    resuelve el proveedor con env.PAYMENTS_PROVIDER
```

Variables previstas como *secrets* del Worker (nunca en el cliente): `LAFISE_API_BASE`, `LAFISE_MERCHANT_ID`, `LAFISE_API_KEY`, `LAFISE_WEBHOOK_SECRET`. Si falta alguna, el adaptador se niega a operar; no hay valores por defecto inventados.

### 6.3 Flujo de cobro

1. El cron de 15 minutos encola `billing.charge-due`.
2. Selecciona suscripciones `active` o `past_due` con `current_period_end` a tres días o menos, `cancel_at_period_end = 0` y método de pago activo.
3. Crea o reutiliza la factura del período con el `period_start` / `period_end` del ciclo real.
4. Registra el intento con `idempotency_key = sub:{orgId}:{periodStart}:{attemptNo}`.
5. Llama a `provider.charge`. **Nunca** se marca pagado por haber enviado la solicitud: solo con `succeeded` o con webhook verificado.
6. Éxito: `billing_payments.confirmed`, factura pagada, `activateSubscriptionForPeriod`, evento, auditoría y aviso al prestamista.
7. Fallo: `failed` y `next_retry_at` con espera progresiva (1, 3 y 5 días) mientras `now < grace_ends_at`; al agotarse pasa a `past_due` y después a `expired` con el job que ya existe.
8. Webhook del banco: firma verificada e idempotencia; si el intento ya estaba confirmado responde `duplicated: true`.

### 6.4 Seguridad

- Nunca se guardan número completo de tarjeta ni CVV: solo token, marca, últimos cuatro y vencimiento.
- Credenciales únicamente en *secrets* del Worker; `PAYMENTS_PROVIDER` es solo un nombre público.
- Toda operación sensible ocurre en el servidor; el navegador nunca llama al banco.
- `payment_methods` y `billing_payments` se filtran por `org_id`; el administrador ve todo, el prestamista solo lo suyo.
- Se guarda el consentimiento (`authorization_ref`, `authorized_at`) y se audita cada alta, cambio o baja de tarjeta.

### 6.5 API y interfaz

| Ámbito | Ruta nueva |
| --- | --- |
| Prestamista | `GET` y `POST /api/subscriptions/payment-method`, `DELETE /api/subscriptions/payment-method/:id`, `GET /api/subscriptions/upcoming` |
| Administrador | `GET /api/admin/billing/status`, `GET /api/admin/billing/attempts`, `POST /api/admin/billing/attempts/:id/retry` |

Pantallas: `/app/suscripcion` (método de pago, próximo cobro, historial) y `/admin/pagos` (estado de la integración, próximos cobros, intentos fallidos, conciliación).

## 7. Etapas

| Etapa del brief | Estado |
| --- | --- |
| 1. Análisis y propuesta | ✅ este documento |
| 2. Base de datos y servicios | ✅ `0007_billing_engine.sql`, adaptador de pagos y repositorios |
| 3. Suscripciones y cobros | ✅ job `billing.charge-due`, reintentos y avisos (adaptador `manual` activo) |
| 4. Integración LAFISE | 🚫 bloqueada: sin contrato ni documentación del banco |
| 5. Pruebas | ✅ 7 pruebas del motor (aprobado, rechazado, duplicado, gratuito, vencimiento) |
| 6. Documentación y entrega | ✅ este documento, [ENVIRONMENT.md](./ENVIRONMENT.md) y [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md) |

## 8. Decisiones pendientes

| # | Pregunta | Opciones | Por defecto |
| --- | --- | --- | --- |
| P1 | ¿Existe ya contrato o credenciales de comercio con LAFISE? | A) Sí, con API · B) Sí, pero sin API · C) Nada todavía | C |
| P2 | Moneda de cobro | A) USD, como los planes · B) Córdobas al tipo de cambio · C) Ambas | A |
| P3 | Mientras no haya API, ¿cobro manual o automático? | A) Manual, como hoy · B) Automático con el proveedor | A |

## 9. Riesgos

- Escribir el adaptador a ciegas y rehacerlo: mitigado con interfaz propia y adaptador que falla de forma explícita.
- Comisiones y tipo de cambio pueden hacer que USD 9,90 no sea rentable cobrado en córdobas.
- Si LAFISE solo ofrece pago único sin token, el cobro recurrente exige recordatorio y pago manual; el motor propuesto ya lo soporta.
- Un reintento mal configurado puede cobrar dos veces: se evita con idempotencia por período, `attempt_no` y confirmación por webhook.

## 10. Implementado el 2026-11-28

| Archivo | Qué hace |
| --- | --- |
| `migrations/0007_billing_engine.sql` | `payment_methods`, columnas de intento en `billing_payments`, `subscriptions.payment_method_id` e índices |
| `src/worker/services/payments/` | Contrato `PaymentProvider`, fábrica, adaptador `manual` y adaptador `lafise` que falla explícitamente |
| `src/worker/services/billing-cycle.ts` | Motor: detecta vencimientos, emite factura, cobra, reintenta y notifica |
| `src/worker/repositories/payment-methods.ts` | Alta, listado seguro (sin token), revocación |
| `src/worker/repositories/billing-attempts.ts` | Intentos idempotentes, resultado, reintento manual |
| `src/worker/jobs/handlers.ts` | Job `billing.charge-due` encolado desde el cron de 15 minutos |
| `src/worker/routes/subscriptions.ts` | `GET /upcoming`, `GET /payment-method`, `DELETE /payment-method/:id` |
| `src/worker/routes/admin.ts` | `GET /billing/status`, `/billing/attempts`, `/billing/upcoming`, `POST /billing/attempts/:id/retry` |
| `src/client/modules/subscriptions/SubscriptionPage.tsx` | Próximo cobro y método de pago |
| `src/client/modules/admin/AdminPaymentsPage.tsx` | Panel `/admin/pagos`: integración, próximos cobros e intentos |
| `tests/worker/billing-cycle.test.ts` | 7 pruebas del motor |

Comportamiento actual con `PAYMENTS_PROVIDER=manual`: a tres días del vencimiento se emite la factura del período y se avisa al propietario; **no se cobra**. El cobro automático se activa el día que existan credenciales y el adaptador LAFISE implementado.

## 11. Referencias

- [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md) — tablas, planes y flujo actual.
- [PLANES-Y-MODULOS.md](./PLANES-Y-MODULOS.md) — planes, módulos, complementos y límites.
- [SUSCRIPCIONES-MODULARES-DIAGNOSTICO.md](./SUSCRIPCIONES-MODULARES-DIAGNOSTICO.md) — arquitectura modular por etapas.
- [SECURITY.md](./SECURITY.md) — controles de seguridad del proyecto.
- [ENVIRONMENT.md](./ENVIRONMENT.md) — variables y secretos.
