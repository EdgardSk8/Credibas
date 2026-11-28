# Planes, módulos y pagos

> Datos leídos de la base local el **2026-11-28**. La fuente de verdad es la tabla `plans` + `plan_limits` y se edita en **/admin/planes**. La landing y la app leen de ahí; no hay precios fijos en el código.

## 1. Planes y precios

| Plan | Mensual | Anual | Ahorro anual | Notas |
| --- | --- | --- | --- | --- |
| **Gratis** | $0 | — | — | Una sola vez por negocio, **15 días**. No se puede volver a elegir. |
| **Starter** | $9.90 | $99 | 2 meses | Entrada para prestamista individual |
| **Professional** | $24.90 | $249 | 2 meses | Cobradores y caja |
| **Business** | $49.90 | $499 | 2 meses | Equipos y sucursales |

El plan Gratis no aparece en la web pública (`is_public = 0`); solo se ve dentro de la app.

## 2. Límites por plan

| Límite | Gratis | Starter | Professional | Business |
| --- | --- | --- | --- | --- |
| Usuarios | 1 | 1 | 5 | 15 |
| Clientes | 50 | 300 | 2,000 | 10,000 |
| Préstamos activos | 25 | 150 | 1,000 | 5,000 |
| Cobradores | 0 | 0 | 5 | 25 |
| Sucursales | 1 | 1 | 2 | 5 |
| Exportaciones / mes | 5 | 20 | 100 | 500 |
| Historial visible | 90 días | 365 días | 1,095 días | 3,650 días |
| Almacenamiento | 100 MB | 500 MB | 2,048 MB | 10,240 MB |

Estos límites **sí se validan en el backend**: al superarlos la API responde `402 plan_limit_reached` con `metric`, `limit` y `current`. `-1` significa ilimitado.

## 3. Módulos del producto

Los módulos están disponibles en los cuatro planes; lo que cambia son los límites anteriores y las capacidades comerciales del plan.

| Módulo | Qué hace |
| --- | --- |
| **Panel** | KPIs de cartera, colocación vs. cobranza, próximos vencimientos y actividad reciente |
| **Clientes** | Expediente con identificación, teléfonos, referencias, notas, documentos y estado |
| **Préstamos** | Capital, tasa, frecuencia y método (cuota fija, interés plano, capital constante); calendario, comisiones, mora, días de gracia, reestructuración versionada y cancelación |
| **Simulador** | Cálculo de cuotas antes de desembolsar; no guarda nada |
| **Cuotas** | Calendario global con filtros por estado y fecha, mora acumulada |
| **Pagos** | Registro con distribución automática (mora → interés → capital → comisión), abonos a capital, comprobante por correo y reversión auditada |
| **Cobros** | Agenda por rango de días, asignación a cobradores, gestiones y promesas de pago |
| **Caja** | Apertura, movimientos manuales y automáticos, cierre con arqueo y diferencia |
| **Reportes** | Cartera, morosidad, envejecimiento (aging), pagos por período y flujo de caja; exportación CSV |
| **Configuración** | Datos del negocio, preferencias financieras (mora, gracia, orden de aplicación), equipo, roles e invitaciones |
| **Suscripción** | Plan actual, uso, días restantes, facturas, plan gratis y solicitudes de cambio |
| **Administración** | Solo administrador de plataforma: resumen (MRR/ARR), organizaciones, planes y solicitudes |

## 4. Qué declara cada plan

Texto comercial guardado en `plans.features_json` (editable en /admin/planes):

| Plan | Incluye |
| --- | --- |
| **Gratis** | Acceso a módulos principales · 1 usuario · hasta 25 préstamos activos · soporte por correo |
| **Starter** | Clientes y préstamos · control de cuotas y pagos · reportes básicos · 1 usuario · soporte por correo |
| **Professional** | Todo lo de Starter · hasta 5 usuarios · gestión de cobradores · caja y arqueos · reportes avanzados · exportaciones |
| **Business** | Todo lo de Professional · hasta 15 usuarios · roles personalizados · sucursales · mayor almacenamiento · soporte prioritario |

> Ojo: `features_json` es texto de marketing. Lo que el backend aplica son los límites de la sección 2. «Roles personalizados» y «sucursales» deben contrastarse con el código antes de prometerlos como módulos separados.

## 5. Cómo se paga

```
Gratis (una vez, 15 días)
        │
        ▼
Solicitud de plan  ──►  pendiente  ──►  el administrador verifica el pago
                                            │
                             ┌──────────────┴──────────────┐
                             ▼                             ▼
                        Aprobada                     Rechazada
                  activa el plan,                 cierra con motivo;
                  factura pagada                  se puede reintentar
```

- **No hay cobro automático** ni el usuario puede activar un plan de pago por su cuenta.
- Una sola solicitud pendiente por negocio (índice único parcial).
- Al aprobar se crea la factura como **pagada** y se extiende el período (30 días mensual / 365 anual).
- Al vencer, la suscripción pasa a `expired` y se muestran los días restantes y la tolerancia de 3 días.
- El plan Gratis se marca con `organizations.free_plan_used_at`; al terminar devuelve `409` si se intenta reutilizar.
- El administrador también puede asignar un plan directamente desde **Admin → Organizaciones** (es quien define los planes).

## 6. Comparación de mercado (resumen)

| Referencia | Entrada | Media | Alta |
| --- | --- | --- | --- |
| **Credibas** | $9.90 | $24.90 | $49.90 |
| Prestafolio (LatAm) | $10 | $25 | $50 |
| PrestaLider (Nicaragua) | ≈ $25 | ≈ $50 | ≈ $75–100 |
| LoanTabs | $9.99–12.99 | $19.99–24.99 | $54.99–69.99 |
| Lendbox | $25–29 | $89–149 | $185+ |
| Loandisk | $59 | $129–179 | $346 |

Los tres precios de Credibas coinciden con el tramo latinoamericano y quedan por debajo del global. Detalle y fuentes: [PRICING-RESEARCH.md](./PRICING-RESEARCH.md).

## 7. Dónde se cambia

| Qué | Dónde |
| --- | --- |
| Precio mensual/anual, prueba, visibilidad y features | `/admin/planes` |
| Límites por plan | `/admin/planes` (formulario de límites) |
| Módulos y complementos | `/admin/catalogo` |
| Solicitudes y aprobación de pagos | `/admin/solicitudes` |
| Asignar plan a una organización | `/admin/organizaciones` |
| Plan gratis y duración | Plan `trial` en `/admin/planes` (`trial_days`) |

## 8. Catálogo comercial (Etapa 2 implementada)

Tablas nuevas: `modules`, `module_dependencies`, `plan_modules`, `addons`, `plan_addons`.
Administración: `/admin/catalogo` (API `GET /api/admin/catalog`, `POST/PATCH /api/admin/modules` y `/api/admin/addons`).

| Módulo | Clave | Precio | Incluido en |
| --- | --- | --- | --- |
| Operación financiera (núcleo) | `core` | $0 | Todos |
| Gestión de clientes (núcleo) | `clients` | $0 | Todos |
| Inteligencia y reportes | `reports` | $5 / $50 | Starter, Professional, Business |
| Cobranza | `collections` | $5 / $50 | Professional, Business |
| Caja y tesorería | `cash` | $5 / $50 | Professional, Business |
| Equipo y roles | `team` | $3 / $30 | Professional, Business |

| Complemento | Límite | Precio | Planes (máx.) |
| --- | --- | --- | --- |
| +500 clientes | `clients` | $3 / $30 | Starter 3 · Professional 5 · Business 10 |
| +500 préstamos activos | `active_loans` | $5 / $50 | Starter 2 · Professional 4 · Business 8 |
| +1 usuario | `users` | $2 / $20 | Starter 1 · Professional 5 · Business 10 |
| +5 GB de almacenamiento | `storage_mb` | $3 / $30 | Starter 2 · Professional 6 · Business 10 |
| +1 sucursal | `branches` | — | **Inactivo**: no existe la entidad |
| +180 días de historial | `history_days` | — | **Inactivo**: falta enforcement |

> El catálogo ya se administra desde la base de datos, pero **todavía no altera la facturación ni los límites**: el motor de precios y la contratación por organización son las etapas 3 y 4.

## 9. Motor de precios (Etapa 3 implementada)

- Cálculo puro en `src/shared/billing/pricing.ts` → `quoteSubscription(catalog, config)`.
- Carga del catálogo efectivo en `src/worker/services/pricing.ts` → `loadPlanCatalog(db, planKey)`.
- Endpoints: `GET /api/subscriptions/catalog` y `POST /api/subscriptions/quote`.
- Reglas aplicadas: todo en centavos, módulos incluidos no se cobran, núcleo obligatorio, dependencias satisfechas, complementos sin duplicar y con tope por plan, anual con descuento calculado.
- Errores con código propio (`dependency_missing`, `addon_quantity_exceeded`, etc.) y HTTP 400.

Ejemplos verificados:

| Configuración | Cálculo | Total |
| --- | --- | --- |
| Starter mensual | plan | $9.90 |
| Starter + Cobranza mensual | $9.90 + $5.00 | $14.90 |
| Professional anual + 2 × +500 clientes | $249 + 2 × $30 | $309.00/año (equivalente $370.80, ahorro $61.80) |
| Gratis + +500 clientes | complemento no disponible | HTTP 400 |

> El motor cotiza, pero **no cambia la suscripción ni emite facturas**; eso corresponde a las etapas 4 y 6.

## 10. Configuración por organización (Etapa 4 implementada)

Tablas nuevas: `subscription_modules`, `subscription_addons`, `subscription_change_history`. Se añadió `subscriptions.grace_ends_at`.

| Capacidad | Detalle |
| --- | --- |
| Configuración actual | `GET /api/admin/organizations/:id/subscription-config` |
| Vista previa | `POST .../subscription-config/preview` → cotización + límites excedidos |
| Aplicar cambio | `POST .../subscription-config` → guarda módulos, complementos e historial y audita |
| Límites efectivos | `plan_limits` + complementos activos; se usan en `assertCanAdd` y en `/api/subscriptions/current` |
| Bajar de plan | Se bloquea con `409` si el uso actual supera algún límite (`exceeded`) |
| Tolerancia | `grace_ends_at = fin del período + grace_days`; el job de expiración lo respeta |
| Historial | `subscription_change_history` guarda antes/después de cada cambio |

Al aplicar un cambio, los módulos quitados quedan en `status = 'canceled'` con `ends_at`; **no se borra ningún dato**. La facturación y el prorrateo siguen pendientes (etapa 6).

### Pantalla administrativa

`/admin/organizaciones/:id/suscripcion`, accesible con el botón **Suscripción** de la lista de organizaciones:

- Elige plan y periodicidad (mensual o anual).
- Marca los módulos adicionales que quiera vender; los incluidos en el plan aparecen como «Incluido» y no se cobran.
- Ajusta complementos de capacidad con el máximo permitido por plan.
- Muestra la cotización en vivo con desglose (plan, módulos, complementos) y el total.
- Si el uso actual supera algún límite del plan elegido, lista los límites excedidos y **desactiva** el botón de aplicar.

Con esto se puede vender **un solo módulo** (por ejemplo, Cobranza a un Starter) sin cambiar de plan.
