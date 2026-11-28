# Suscripciones modulares · Diagnóstico y plan

> Etapa 1 del brief de suscripciones modulares. Fecha: **2026-11-28**.
> Alcance: estado real del código, tablas reutilizables, brechas y plan por etapas.
> No se modificó código en esta etapa.

## 1. Resumen ejecutivo

Credibas ya tiene una base sólida: planes y límites en base de datos, una suscripción por organización, solicitudes con aprobación administrativa, facturas, pagos manuales, webhook firmado e idempotente, aislamiento multiempresa y un motor de límites centralizado con error `402 plan_limit_reached`.

Lo que falta para el modelo **plan base + módulos + complementos + precio dinámico** es:

1. Catálogo de módulos con dependencias y módulos incluidos por plan.
2. Complementos de capacidad con topes por plan.
3. Motor de precios centralizado (hoy el precio es el del plan, sin desglose).
4. Facturas con ítems y fotografía de la configuración.
5. Configurador de suscripción en la app.
6. Prorrateo y política de cambios.
7. Estados `pending` y `grace_period` explícitos.
8. Enforcement real de `exports_per_month` y `history_days` (hoy solo son etiquetas).
9. Pasarela de pagos (hoy solo manual).

**Recomendación:** extender lo existente, no reescribir. `plans` y `plan_limits` siguen siendo la fuente de verdad.

## 2. Inventario actual

### Tablas que se reutilizan

| Tabla | Rol actual | Decisión |
| --- | --- | --- |
| `plans` | Precio mensual/anual, prueba, gracia, visibilidad, features | **Se mantiene** como plan base |
| `plan_limits` | Límites por plan (8 métricas) | **Se mantiene**; los add-ons se suman encima |
| `subscriptions` | Una por organización, ciclo y período | **Se extiende** con `base_price_cents` y configuración |
| `subscription_usage` | Consumo por métrica | Se mantiene |
| `subscription_events` | Bitácora de cambios | Se mantiene; se añaden tipos |
| `subscription_requests` | Solicitudes de plan con aprobación | **Se reutiliza** para módulos y add-ons |
| `invoices` | Factura con `amount_cents` total | **Se extiende** con subtotal, descuento, impuesto e ítems |
| `billing_payments` | Pago manual/proveedor, único por `(provider, provider_ref)` | Se mantiene |
| `audit_logs` | Auditoría | Se mantiene |
| `organizations.free_plan_used_at` | Plan gratis de una sola vez | Se mantiene |

### Tablas que **no existen** y el brief propone

`modules`, `module_features`, `plan_modules`, `module_dependencies`, `subscription_modules`, `addons`, `plan_addons`, `subscription_addons`, `subscription_change_history`, `invoice_items`, `payment_methods`, `payment_webhook_events`.

Conclusión: no hay duplicados que evitar; hay que crearlas.

## 3. Estado por área

| Requisito del brief | Estado hoy | Detalle |
| --- | --- | --- |
| Planes base y precios | ✅ | 4 planes: Gratis $0 (una vez, 15 d), Starter $9.90/$99, Professional $24.90/$249, Business $49.90/$499 |
| Límites validados en backend | ⚠️ parcial | Se aplican 6 de 8: usuarios, clientes, préstamos, cobradores, almacenamiento y sucursales (siempre 0 porque no existe la entidad). **`exports_per_month` y `history_days` no se validan** |
| Catálogo de módulos | ❌ | No existen. El acceso se controla con permisos RBAC, no por módulo contratado |
| Dependencias entre módulos | ❌ | No existen |
| Add-ons de capacidad | ❌ | No existen; los límites solo cambian al cambiar de plan |
| Motor de precios centralizado | ❌ | El importe se toma del plan (`amount = plan.price_*`) en la aprobación y en la confirmación de pago. Sin descuentos, prorrateo ni desglose |
| Configurador de suscripción | ❌ | Solo hay solicitud de plan y activación del plan gratis |
| Cambios ascendentes/descendentes | ⚠️ | Aprobación manual. No se valida si el uso actual excede el nuevo plan antes de aplicar |
| Prorrateo | ❌ | El período se reinicia al aprobar (`now → now + 30/365 días`); no hay crédito por días no usados |
| Estados | ⚠️ | `trialing`, `active`, `past_due`, `canceled`, `expired`. Faltan `pending` y `grace_period`; la tolerancia de 3 días es solo texto en la UI |
| Facturación detallada | ❌ | `invoices` solo guarda `amount_cents`; sin ítems, impuestos ni fotografía de módulos |
| Pagos manuales | ✅ | Solicitud → pendiente → aprobación → factura pagada + evento + auditoría |
| Pagos automáticos | ⚠️ | Webhook HMAC e idempotencia por `provider_ref`; sin pasarela, tarjetas ni renovación automática |
| Métodos de pago guardados | ❌ | No existe `payment_methods` |
| Roles personalizados | ❌ | Cinco roles fijos: owner, admin, supervisor, collector, viewer |
| Sucursales | ❌ | El límite existe, pero no hay tabla, UI ni asignación de datos a sucursal |
| Notificaciones / automatización | ⚠️ | Tabla `notifications`, jobs de correo y job de expiración; falta verificar recordatorios de renovación |
| Aislamiento multiempresa | ✅ | `org_id` en todas las consultas y pruebas de aislamiento |
| Administración del catálogo | ⚠️ | `/admin/planes` permite CRUD de planes y límites; no hay módulos ni add-ons |

## 4. Brechas que afectan la promesa comercial

Antes de vender módulos hay que decidir qué existe de verdad:

- **Sucursales**: el plan Business promete 5 sucursales, pero no hay entidad `branches`. Implementarla implica tablas, UI, filtros por sucursal y migración de datos.
- **Roles personalizados**: los roles son fijos; crear roles por organización es un módulo aparte.
- **Automatización**: existen notificaciones y jobs, pero no un módulo configurable de recordatorios.
- **Exportaciones e historial**: se muestran en el uso del plan, pero no se bloquean al superar el límite.

## 5. Modelo de datos propuesto

### 5.1 Catálogo

```sql
modules (id, key, name, description, price_monthly_cents, price_yearly_cents,
         currency, is_core, is_active, sort_order, features_json, created_at, updated_at)

module_dependencies (module_id, depends_on_module_id, PRIMARY KEY (module_id, depends_on_module_id))

plan_modules (plan_id, module_id, included, PRIMARY KEY (plan_id, module_id))

addons (id, key, name, description, metric, unit_amount, unit_label,
        price_monthly_cents, price_yearly_cents, currency, is_active, sort_order)

plan_addons (plan_id, addon_id, max_quantity, PRIMARY KEY (plan_id, addon_id))
```

### 5.2 Contratación por organización

```sql
subscription_modules (id, subscription_id, module_id, status, activated_at, ends_at,
                      price_snapshot_cents, created_at,
                      UNIQUE (subscription_id, module_id))

subscription_addons (id, subscription_id, addon_id, quantity, price_snapshot_cents,
                     activated_at, ends_at,
                     UNIQUE (subscription_id, addon_id))

subscription_change_history (id, subscription_id, kind, before_json, after_json,
                             actor_user_id, created_at)
```

### 5.3 Facturación

```sql
invoice_items (id, invoice_id, kind, ref_id, description, quantity,
               unit_price_cents, total_cents)

payment_methods (id, org_id, provider, token_ref, brand, last4, exp_month, exp_year,
                 is_default, created_at)

payment_webhook_events (id, provider, event_id, payload_json, processed_at,
                        UNIQUE (provider, event_id))
```

### 5.4 Cambios sobre tablas existentes

- `invoices`: añadir `subtotal_cents`, `discount_cents`, `tax_cents`, `config_snapshot_json`.
- `subscriptions`: añadir `base_price_cents` y `grace_ends_at`.
- `subscription_requests`: añadir `kind` (`plan` | `module` | `addon` | `config`) y `config_json`.

Todas las FKs con `ON DELETE CASCADE` donde corresponda, índices por `org_id`/`subscription_id` y un índice único parcial para impedir dos módulos activos iguales.

## 6. Servicios propuestos

| Servicio | Responsabilidad |
| --- | --- |
| **PricingService** | Cálculo puro en centavos: plan + módulos opcionales + add-ons − descuentos. Mensual/anual y prorrateo. Única fuente del importe |
| **SubscriptionService** | Componer la configuración, validar dependencias y compatibilidad, aplicar cambios y guardar snapshots |
| **ModuleAccessService** | `canAccess(orgId, moduleKey)` para rutas y UI; responde `402 module_not_contracted` |
| **PlanLimitService** | Límites efectivos = `plan_limits` + `subscription_addons`; mantiene `402 plan_limit_reached` |
| **BillingService** | Facturas con ítems, fotografía de configuración y notas de crédito por prorrateo |
| **PaymentService** | Pagos manuales (actual) y webhooks idempotentes; sin datos de tarjeta |

## 7. Reglas del motor de precios

1. Todo en **centavos enteros**; nunca `float`.
2. El backend calcula; el frontend solo muestra.
3. `mensual = plan + Σ módulos opcionales + Σ add-ons`.
4. `anual = plan anual + Σ módulos anuales + Σ add-ons anuales`.
5. Descuento anual de dos meses (16.7 %) para plan y módulos; los add-ons se definen aparte.
6. Un módulo incluido en el plan no se cobra.
7. Dependencias satisfechas antes de cotizar.
8. Tope de add-ons por plan (`plan_addons.max_quantity`).
9. La factura guarda `invoice_items` y `config_snapshot_json`; los cambios futuros de catálogo no alteran facturas pasadas.
10. Prorrateo: definir política (ver decisiones).

## 8. Migración de clientes actuales

Orden propuesto, sin romper nada:

1. Crear tablas nuevas (sin tocar las existentes).
2. Sembrar módulos núcleo y `plan_modules` según lo que ya ofrece cada plan.
3. Para cada suscripción existente, insertar `subscription_modules` de los módulos incluidos, con `price_snapshot_cents = 0`.
4. Mantener `plan_id`, período, precios y límites intactos.
5. No tocar facturas ni solicitudes históricas; las nuevas facturas sí llevan ítems.
6. Añadir `grace_ends_at` calculado desde `grace_days`.
7. Rollback: las migraciones solo crean tablas/columnas; revertir es `DROP` de lo nuevo, sin pérdida de datos existentes.

## 9. Etapas de implementación

| Etapa | Entregable | Tamaño |
| --- | --- | --- |
| 1. Auditoría | Este documento | ✅ |
| 2. Catálogo | Migración de módulos, dependencias, plan_modules, addons y plan_addons + seed de módulos núcleo + admin `/admin/planes` con pestañas Módulos y Complementos | ✅ Hecho: 6 módulos, 6 complementos, `/admin/catalogo` |
| 3. Motor de precios | `PricingService` con pruebas unitarias (mensual/anual, incluidos, opcionales, addons, topes, dependencias) | ✅ Hecho: `quoteSubscription` + `GET /api/subscriptions/catalog` + `POST /api/subscriptions/quote` |
| 4. Suscripciones | `subscription_modules`, `subscription_addons`, `change_history`, validación de límites al bajar de plan, `grace_ends_at` | ✅ Hecho: configuración por organización + límites efectivos + admin API |
| 5. Interfaz | Configurador en `/app/suscripcion` con resumen de compra, precio anterior/nuevo, dependencias y confirmación | L |
| 6. Facturación y pagos | `invoice_items`, snapshot, prorrateo, `payment_methods`, `payment_webhook_events`, estados `pending` y `grace_period` | L |
| 7. Migración y pruebas | Backfill de suscripciones existentes, pruebas de aislamiento, documentación final | M |

## 10. Pruebas obligatorias

- Precio mensual y anual con 0, 1 y N módulos opcionales.
- Módulo incluido no se cobra; add-on no se duplica.
- Dependencia faltante bloquea la contratación.
- Tope de add-on por plan.
- Límites efectivos con add-ons.
- Cambio ascendente y descendente; negativa si el uso excede el nuevo plan.
- Cancelación conserva datos y revoca acceso al terminar el período.
- Factura histórica no cambia al cambiar el catálogo.
- Webhook duplicado no duplica factura ni activación.
- Aislamiento entre organizaciones.
- Migración: una suscripción existente conserva funcionalidades y precio.

## 11. Riesgos

- **Complejidad comercial**: el configurador debe explicar el total sin ambigüedad.
- **Prorrateo**: mal calculado genera reclamos; conviene empezar sin prorrateo (cambio al siguiente período).
- **Pasarela en Nicaragua**: no verificada; el flujo manual debe seguir siendo el principal.
- **Downgrade con exceso de uso**: definir si se bloquea el cambio o se permite con límites excedidos.
- **Promesas sin código**: sucursales y roles personalizados no existen.
- **Límites no aplicados**: `exports_per_month` y `history_days` necesitan enforcement antes de venderlos.

## 12. Decisiones pendientes

1. ¿Los módulos opcionales se cobran aparte o solo agrupan funcionalidades ya incluidas?
2. ¿Prorrateo al subir/bajar o cambios al inicio del siguiente período?
3. ¿Se implementan sucursales y roles personalizados, o se retiran de la promesa comercial?
4. ¿Qué módulos incluye el plan Gratis?
5. ¿Tope máximo de add-ons por plan (para no convertir un Starter en Business)?
6. ¿Pasarela objetivo o se mantiene solo pago manual por ahora?

## 13. Archivos clave

- `migrations/0001_core.sql`, `0002_seed.sql`, `0004_subscription_requests.sql`
- `src/worker/repositories/subscriptions.ts`, `admin.ts`, `organizations.ts`
- `src/worker/routes/subscriptions.ts`, `admin.ts`, `webhooks.ts`
- `src/worker/services/limits.ts`
- `src/shared/validation.ts`, `types.ts`, `rbac.ts`
- `src/client/modules/subscriptions/SubscriptionPage.tsx`
- `src/client/modules/admin/AdminPlansPage.tsx`, `AdminRequestsPage.tsx`
- `docs/SUBSCRIPTIONS.md`, `docs/PLANES-Y-MODULOS.md`, `docs/PRICING-RESEARCH.md`
