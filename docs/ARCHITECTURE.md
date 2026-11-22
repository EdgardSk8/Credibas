# Arquitectura

## Visión general

Credibas es un monolito modular desplegado como un único Worker de Cloudflare que sirve tres cosas:

1. **API REST** bajo `/api/*` (Hono).
2. **Aplicación React** compilada como assets estáticos (SPA).
3. **Trabajos asíncronos** mediante Queue consumer y Cron Triggers.

```
Navegador
   │
   ├── /*            → Static Assets (dist/client, SPA fallback)
   └── /api/*        → Worker
                         ├── Hono: middleware → rutas → servicios → repositorios
                         ├── D1 (datos relacionales)
                         ├── R2 (documentos)
                         ├── Queues (correo, recordatorios, limpieza)
                         └── Cron (mora, vencimientos, expiración de suscripciones)
```

El mismo paquete de TypeScript se comparte entre cliente y worker (`src/shared`). Eso permite validar con el mismo esquema Zod en ambos lados y reutilizar el motor financiero para la vista previa del calendario sin duplicar fórmulas.

## Capas del backend

| Capa | Responsabilidad | Ubicación |
| --- | --- | --- |
| Middleware | request id, headers, CSRF, sesión, organización activa, permisos | `src/worker/middleware` |
| Rutas | Contrato HTTP, validación de entrada, códigos de estado | `src/worker/routes` |
| Servicios | Reglas de negocio, transacciones, auditoría, colas | `src/worker/services` |
| Repositorios | SQL parametrizado sobre D1, siempre con `org_id` | `src/worker/repositories` |
| Motor financiero | Cálculos puros sin I/O | `src/shared/finance` |

Regla: una ruta no arma SQL y un repositorio no decide reglas de negocio.

## Multi-tenancy

- La organización activa se guarda en `sessions.org_id`.
- El middleware valida la membresía (`organization_members.status = 'active'`) en cada request y expone `orgId`, `roleKey` y `permissions`.
- **Nunca** se acepta un `org_id` enviado por el cliente como fuente de verdad.
- Todas las consultas de negocio filtran por `org_id`; las claves primarias son globales con prefijo (`cli_`, `lon_`, `pay_`).
- El acceso cruzado devuelve 404 (no 403) para no revelar existencia de recursos de otros negocios.
- Hay pruebas de integración que crean dos organizaciones y verifican que no se puedan leer ni operar recursos ajenos (`tests/worker/isolation-payments.test.ts`).

## Autenticación

Se implementó autenticación propia sobre primitivas estándar de la plataforma:

- Contraseñas: **PBKDF2-SHA256** vía WebCrypto, 100.000 iteraciones por defecto (configurable con `PASSWORD_ITERATIONS`), sal aleatoria de 16 bytes por usuario, comparación en tiempo constante.
- Sesiones: token opaco de 256 bits en cookie `HttpOnly`, `Secure` (cuando HTTPS), `SameSite=Lax`; en D1 solo se guarda el SHA-256 del token.
- Verificación de correo: **código de 6 dígitos** (CSPRNG) guardado solo como hash ligado al usuario, vigencia de 10 minutos, máximo 5 intentos por código, cooldown de 60 segundos y máximo 5 envíos por hora. Comparación en tiempo constante. Recuperación de contraseña e invitaciones siguen usando tokens de un solo uso hasheados con expiración y consumo atómico (`UPDATE ... RETURNING`).
- Bloqueo progresivo por intentos fallidos y rate limiting por IP/correo.
- CSRF: validación de `Origin`/`Referer` en métodos mutables + `SameSite=Lax`.

**Evaluación de librerías**: se evaluó Better Auth (compatible con Workers y D1 vía Kysely), pero se descartó para esta fase porque impone su propio esquema y su ciclo de actualizaciones, mientras que el modelo de Credibas requiere tablas de dominio propias y control total de la sesión y la auditoría. No se implementa criptografía propia: todo se delega a WebCrypto.

## RBAC

- Permisos atómicos (`clients.read`, `payments.reverse`, …) en la tabla `permissions`.
- Cada organización tiene sus roles (`roles`) y la relación `role_permissions`.
- Al crear una organización se siembran cinco roles del sistema: Propietario, Administrador, Supervisor, Cobrador y Consulta.
- El frontend oculta acciones sin permiso, pero **el backend siempre vuelve a validar** (`requirePermission`).

## Motor financiero

Módulo puro, sin dependencias del worker, reutilizado por el cliente para la vista previa:

- `money.ts`: parseo y formato, centavos, puntos base, reparto de residuos.
- `dates.ts`: fechas de negocio `YYYY-MM-DD` en UTC, suma de meses con ajuste de fin de mes.
- `schedule.ts`: interés plano, cuota fija (anualidad) y capital constante.
- `late-fees.ts`: mora simple diaria con período de gracia.
- `allocation.ts`: distribución de pagos con orden configurable y abonos a capital.

Detalle matemático en [FINANCIAL-CALCULATIONS.md](FINANCIAL-CALCULATIONS.md).

## Integridad transaccional

- D1 `batch()` ejecuta múltiples sentencias como **una transacción atómica**.
- Un pago se registra junto con sus asignaciones y la actualización de cuotas en un solo batch.
- La reversión nunca borra: cambia el estado del pago, resta lo aplicado, reabre cuotas y escribe `payment_reversals` + `audit_logs`.
- Los incrementos de pago son relativos (`paid_principal_cents + ?`) para no perder escrituras concurrentes.
- Los estados de cuota se recalculan en la misma sentencia SQL a partir de los nuevos totales.

Limitación conocida: si dos pagos concurrentes se calculan sobre el mismo estado, la asignación del segundo puede quedar desactualizada respecto a los saldos. D1 serializa las escrituras, pero no las lecturas previas. Mitigación actual: rechazo de pagos que exceden el saldo y `MIN()` en los acumuladores para no superar el total de la cuota. Próximo paso: bloqueo optimista por versión de préstamo.

## Trabajos asíncronos

| Job | Origen | Acción |
| --- | --- | --- |
| `email.send` | Registro, invitaciones, comprobantes | Envía correo con el proveedor configurado |
| `maintenance.refresh-overdue` | Cron 15 min y alta de préstamo | Marca cuotas vencidas y acumula mora |
| `notifications.installment-reminders` | Cron diario | Notificación in-app de cuotas por vencer |
| `notifications.overdue-digest` | Cron diario | Resumen de cartera vencida |
| `billing.expire-subscriptions` | Cron diario | Expira suscripciones fuera de período |
| `cleanup.tokens` | Cron diario | Purga tokens, sesiones y rate limits viejos |

El Cron de cada 15 minutos actualiza vencimientos por organización usando su zona horaria; el diario (13:00 UTC) encola recordatorios y limpieza.

## Frontend

- SPA con React Router 7. Rutas públicas, de autenticación, privadas y de plataforma.
- `AuthProvider` mantiene `/api/auth/me` y expone `hasPermission`.
- Estado de servidor con TanStack Query (cache, invalidación, reintentos acotados).
- Páginas privadas cargadas con `React.lazy` para reducir el bundle público.
- Sistema visual propio: tokens, componentes y composiciones por página. Sin librería de UI ni de gráficos; los gráficos son SVG/CSS con datos reales.

## Decisiones registradas

1. **Un solo Worker con assets** en lugar de Pages + Workers separados: menos superficie, mismo origen (cookies y CSRF simples), despliegue atómico.
2. **IDs con prefijo** (`org_`, `loan_`) en lugar de UUID puro: legibilidad en logs y auditoría. La validación usa un esquema propio, no `z.uuid()`.
3. **Importes en centavos**: evita errores de coma flotante y simplifica SQL.
4. **Sin ORM**: D1 + SQL parametrizado explícito para controlar índices y consultas.
5. **Correo por proveedor intercambiable** (`console`, Cloudflare Email Service, Resend).
6. **Pagos de suscripción desacoplados**: interfaz de proveedor + confirmación administrativa + webhook firmado idempotente.
