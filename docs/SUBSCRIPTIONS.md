# Suscripciones y planes

## Estructura

- `plans`: plan comercial (precio mensual/anual, días de prueba, días de gracia, visibilidad, características).
- `plan_limits`: límites del plan como filas (`users`, `clients`, `active_loans`, `storage_mb`, `collectors`, `branches`, `exports_per_month`, `history_days`).
- `subscriptions`: una por organización (`UNIQUE(org_id)`), con ciclo mensual/anual y período vigente.
- `invoices` y `billing_payments`: facturación y pagos, con idempotencia por `(provider, provider_ref)`.
- `subscription_requests`: solicitudes de cambio de plan (`pending`, `approved`, `rejected`, `canceled`). Una pendiente por organización (índice único parcial).
- `organizations.free_plan_used_at`: marca el consumo del plan gratuito (una sola vez por negocio).
- `subscription_events`: bitácora de cambios y confirmaciones.
- `payment_methods`: tarjeta tokenizada por organización (solo token, marca, últimos cuatro y vencimiento; nunca el número completo ni el CVV).
- `billing_payments`: además de los pagos confirmados, guarda los **intentos de cobro** con `idempotency_key` única, `attempt_no`, error y `next_retry_at`.

**Los precios y límites se editan desde `/admin/planes`. No hay números fijos en el código.**

## Planes iniciales (hipótesis comercial)

| Plan | Mensual | Anual | Usuarios | Clientes | Préstamos activos | Cobradores |
| --- | --- | --- | --- | --- | --- | --- |
| Gratis (una sola vez) | — | — | 1 | 50 | 25 | 0 |
| Starter | USD 9,90 | USD 99 | 1 | 300 | 150 | 0 |
| Professional | USD 24,90 | USD 249 | 5 | 2.000 | 1.000 | 5 |
| Business | USD 49,90 | USD 499 | 15 | 10.000 | 5.000 | 25 |

> ⚠️ Estos valores son **hipótesis** cargadas en la migración de referencia. Antes de publicarlos hay que completar el estudio de mercado (competidores de microfinanzas en Nicaragua y Centroamérica, precios por usuario y por tamaño de cartera, límites de almacenamiento y pruebas gratuitas) y ajustarlos desde el panel.
>
> Comparación con precios públicos verificados (2026-11-28): [PRICING-RESEARCH.md](./PRICING-RESEARCH.md).
>
> Detalle de planes, límites, módulos y flujo de pago: [PLANES-Y-MODULOS.md](./PLANES-Y-MODULOS.md).
>
> Cobros automáticos con tarjeta y verificación de la API de LAFISE: [PAGOS-LAFISE.md](./PAGOS-LAFISE.md).

## Motor de límites

`src/worker/services/limits.ts`:

1. Lee el plan vigente y sus límites desde D1.
2. Calcula el consumo real: miembros activos/invitados, clientes no borrados, préstamos activos, cobradores, MB de documentos.
3. Antes de escribir (crear cliente, préstamo, invitar usuario, subir archivo) compara `consumo + incremento` contra el límite.
4. Si se supera, responde **402** con `code: plan_limit_reached` y detalles (`metric`, `limit`, `current`, `planKey`). El cliente muestra el mensaje y el enlace a suscripción.
5. Los límites con valor `-1` o ausentes se consideran ilimitados.

El frontend muestra barras de uso en `/app/suscripcion`, pero la decisión siempre es del backend.

## Ciclo de vida

```
trialing ──(pago confirmado)──► active ──(fin de período)──► expired
    │                              │
    └──(cancelación)──► canceled ◄─┘
```

- **Gratis**: se activa una sola vez por organización (`free_plan_used_at`), por `trial_days` (15 por defecto). Al terminar no se puede volver a seleccionar: solo queda solicitar un plan de pago.
- **Activa**: período vigente pagado.
- **Pago pendiente**: reservado para recordatorios de renovación.
- **Cancelada**: no renueva; conserva acceso hasta el fin del período pagado.
- **Expirada**: modo de solo lectura; los datos no se eliminan. Se aplica período de gracia configurable antes de marcar expirada.

`assertSubscriptionWritable` bloquea la creación de clientes, préstamos y pagos cuando la suscripción está `expired` o `canceled`.

## Activación de un plan de pago

Regla innegociable: **el frontend nunca activa un plan de pago**.

1. La organización envía una solicitud (`POST /api/subscriptions/request`). Se guarda en `subscription_requests` con estado `pending` y el plan actual no cambia.
2. El administrador de plataforma verifica el pago fuera del sistema (transferencia o comprobante) y revisa la cola en `/admin/solicitudes`.
3. Al aprobar (`POST /api/admin/subscription-requests/:id/approve`) se activa el plan por el ciclo solicitado, se emite la factura como pagada y se registra el evento y la auditoría.
4. Al rechazar (`POST /api/admin/subscription-requests/:id/reject`) la solicitud se cierra con motivo y la organización puede enviar otra cuando regularice el pago.
5. Para un proveedor automático sigue disponible el webhook firmado (`POST /api/webhooks/billing/:provider`).

## Webhook

### Contrato

```http
POST /api/webhooks/billing/{provider}
Content-Type: application/json
x-credibas-signature: <hex HMAC-SHA256 del cuerpo crudo>

{
  "event": "payment.succeeded",
  "providerRef": "unique-id-from-provider",
  "orgId": "org_...",
  "invoiceId": "inv_...",
  "amountCents": 2490,
  "currency": "USD"
}
```

### Reglas

- Firma obligatoria: HMAC-SHA256 con `BILLING_WEBHOOK_SECRET`, comparación con `crypto.subtle.verify`.
- Idempotencia: `UNIQUE(provider, provider_ref)`. Un reintento devuelve `{ ok: true, duplicated: true }` sin duplicar efectos.
- Solo `payment.succeeded` activa; otros eventos se ignoran con `{ ok: true, ignored: true }`.
- Sin secreto configurado, el endpoint responde 503 (no abierto por defecto).
- El monto se toma del payload verificado o de la factura; nunca de un query param.

## Interfaz de proveedor

El diseño está desacoplado: `PAYMENTS_PROVIDER` selecciona el adaptador. Para integrar un proveedor hay que implementar:

1. `createCheckout({ orgId, invoiceId, amountCents, currency })` → URL o instrucciones de pago.
2. `verifyWebhook(rawBody, headers)` → evento normalizado.
3. `refund(paymentRef, amountCents)` si el proveedor lo permite.
4. Mapear estados del proveedor a `pending | confirmed | failed | refunded`.

Mientras no exista proveedor, opera el flujo manual: el cliente transfiere, adjunta comprobante y un administrador confirma.

## Proveedores y Nicaragua (verificación pendiente)

El requisito del proyecto es no asumir disponibilidad. Antes de elegir proveedor hay que verificar en las páginas oficiales:

| Proveedor | Qué verificar | Estado |
| --- | --- | --- |
| Stripe | Países soportados para cuentas de empresa y requisitos de residencia/entidad | **No verificado** |
| PayPal | Recepción de pagos comerciales para cuentas en Nicaragua y retiros | **No verificado** |
| Mercado Pago | Disponibilidad de cuenta vendedor en Nicaragua y suscripciones | **No verificado** |
| BAC Credomatic / Banpro / Lafise | Pasarela para comercios, requisitos y webhooks | **No verificado** |
| Kushki / Payway / Pagadito | Cobertura en Nicaragua, recurrencia y webhooks | **No verificado** |

Recomendación: iniciar con **transferencia + confirmación administrativa** (ya implementado), validar la demanda y luego integrar el proveedor que realmente acepte la operación.

## Límites y cancelación

- No se eliminan datos al expirar. Se bloquea la escritura y se permite consultar/exportar según la política.
- El período de gracia se configura por plan (`grace_days`).
- Al aprobarse un cambio de plan, los límites se recalculan de inmediato; nunca se borra información.
- El historial de facturación queda disponible para la organización.
