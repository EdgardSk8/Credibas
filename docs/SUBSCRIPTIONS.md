# Suscripciones y planes

## Estructura

- `plans`: plan comercial (precio mensual/anual, días de prueba, días de gracia, visibilidad, características).
- `plan_limits`: límites del plan como filas (`users`, `clients`, `active_loans`, `storage_mb`, `collectors`, `branches`, `exports_per_month`, `history_days`).
- `subscriptions`: una por organización (`UNIQUE(org_id)`), con ciclo mensual/anual y período vigente.
- `invoices` y `billing_payments`: facturación y pagos, con idempotencia por `(provider, provider_ref)`.
- `subscription_events`: bitácora de cambios y confirmaciones.

**Los precios y límites se editan desde `/admin/planes`. No hay números fijos en el código.**

## Planes iniciales (hipótesis comercial)

| Plan | Mensual | Anual | Usuarios | Clientes | Préstamos activos | Cobradores |
| --- | --- | --- | --- | --- | --- | --- |
| Prueba | — | — | 1 | 50 | 25 | 0 |
| Starter | USD 9,90 | USD 99 | 1 | 300 | 150 | 0 |
| Professional | USD 24,90 | USD 249 | 5 | 2.000 | 1.000 | 5 |
| Business | USD 49,90 | USD 499 | 15 | 10.000 | 5.000 | 25 |

> ⚠️ Estos valores son **hipótesis** cargadas en la migración de referencia. Antes de publicarlos hay que completar el estudio de mercado (competidores de microfinanzas en Nicaragua y Centroamérica, precios por usuario y por tamaño de cartera, límites de almacenamiento y pruebas gratuitas) y ajustarlos desde el panel.

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

- **Prueba**: se crea con la organización (`trial_days` del plan) y límites reducidos.
- **Activa**: período vigente pagado.
- **Pago pendiente**: reservado para recordatorios de renovación.
- **Cancelada**: no renueva; conserva acceso hasta el fin del período pagado.
- **Expirada**: modo de solo lectura; los datos no se eliminan. Se aplica período de gracia configurable antes de marcar expirada.

`assertSubscriptionWritable` bloquea la creación de clientes, préstamos y pagos cuando la suscripción está `expired` o `canceled`.

## Activación de un plan de pago

Regla innegociable: **el frontend nunca activa una suscripción**.

1. La organización solicita el cambio (`POST /api/subscriptions/change-plan`). Se registra el plan y el evento, pero el estado no se activa.
2. El pago se registra como `billing_payments.status = 'pending'` (manual o por proveedor).
3. La activación ocurre al confirmar el pago:
   - Manual: un administrador de plataforma confirma desde el panel (`POST /api/admin/billing-payments/:id/confirm`).
   - Automático: webhook firmado (`POST /api/webhooks/billing/:provider`).
4. Al confirmar: se marca la factura como pagada, se extiende el período según el ciclo y se registra el evento y la auditoría.

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
- El cambio de plan recalcula límites de inmediato; nunca borra información.
- El historial de facturación queda disponible para la organización.
