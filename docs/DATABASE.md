# Base de datos

D1 (SQLite) con migraciones versionadas en `migrations/`. Las migraciones se aplican en orden y nunca se editan después de publicadas: cualquier cambio va en un archivo nuevo (`0003_...sql`).

## Convenciones

| Tema | Regla |
| --- | --- |
| Identificadores | `TEXT` con prefijo de dominio + UUID (`cli_…`, `lon_…`). Se generan en la aplicación. |
| Importes | `INTEGER` en centavos. Nunca `REAL`. |
| Tasas | `INTEGER` en puntos base (500 = 5,00 %). |
| Fechas de negocio | `TEXT` `YYYY-MM-DD` (UTC, sin hora). |
| Marcas de tiempo | `INTEGER` epoch en milisegundos. |
| Tenancy | Todas las tablas de negocio incluyen `org_id` con FK a `organizations`. |
| Borrado | Los registros financieros no se eliminan; se cambian de estado y se auditan. Clientes usan borrado lógico (`deleted_at`). |

## Tablas

### Identidad

| Tabla | Propósito |
| --- | --- |
| `users` | Cuentas, hash de contraseña (PBKDF2), verificación de correo, flag de administrador de plataforma. |
| `sessions` | Sesiones activas con hash del token, IP, user agent, organización activa y expiración. |
| `email_verifications` | Tokens de enlace de un solo uso (histórico; el flujo actual usa códigos). |
| `email_verification_codes` | Códigos de 6 dígitos hasheados, con expiración, cooldown de reenvío e intentos. |
| `password_resets` | Tokens de un solo uso para restablecer contraseña. |
| `login_attempts` | Intentos de acceso para bloqueo progresivo. |
| `rate_limits` | Ventanas fijas para rate limiting atómico. |

### Organizaciones y RBAC

| Tabla | Propósito |
| --- | --- |
| `organizations` | Negocio (tenant), moneda, zona horaria, estado. |
| `organization_members` | Membresía usuario↔organización con rol y estado. |
| `roles` | Roles por organización; los cinco del sistema se siembran al crear el negocio. |
| `permissions` | Catálogo global de permisos atómicos. |
| `role_permissions` | Permisos asignados a cada rol. |
| `invitations` | Invitaciones por correo con token hasheado y expiración. |

### Suscripciones y facturación

| Tabla | Propósito |
| --- | --- |
| `plans` | Planes comerciales (precio mensual/anual, prueba, gracia, características). |
| `plan_limits` | Límites por plan (`users`, `clients`, `active_loans`, …). |
| `subscriptions` | Suscripción por organización (una sola, `UNIQUE(org_id)`). |
| `subscription_usage` | Snapshots de consumo por período (para histórico). |
| `subscription_events` | Bitácora de cambios de plan, cancelaciones y pagos. |
| `invoices` | Facturas SaaS con número único. |
| `billing_payments` | Pagos de suscripción, manuales o por proveedor; `UNIQUE(provider, provider_ref)` para idempotencia. |

### Operación

| Tabla | Propósito |
| --- | --- |
| `clients` | Expediente del cliente; `UNIQUE(org_id, code)` y `UNIQUE(org_id, identification)` parcial. |
| `client_documents` | Metadatos de archivos en R2. |
| `loans` | Préstamo con condiciones, totales y versión de calendario vigente. |
| `loan_schedule_versions` | Versiones del calendario (inicial, reestructuraciones, abonos). |
| `installments` | Cuotas de la versión vigente con montos pagados y mora acumulada. |
| `loan_adjustments` | Reestructuraciones, abonos y cancelaciones con motivo. |
| `payments` | Pagos confirmados o revertidos. |
| `payment_allocations` | Distribución de cada pago por cuota y componente. |
| `payment_reversals` | Motivo, responsable y fecha de cada reversión (una por pago). |
| `cash_registers` | Apertura y cierre de caja con arqueo. |
| `cash_movements` | Ingresos/egresos vinculados a su operación de origen. |
| `collection_assignments` | Cartera asignada a un cobrador. |
| `collection_activities` | Llamadas, visitas, mensajes, promesas y notas. |
| `notifications` | Avisos in-app y por correo. |
| `audit_logs` | Quién hizo qué, antes y después, con IP y user agent. |
| `exchange_rates` | Tipos de cambio por par y fecha. |
| `settings` | Configuración por organización (`org_id`) o global (`org_id NULL`). |
| `sequences` | Secuencias por organización (códigos de cliente y préstamo). |

## Índices relevantes

- `ux_members_org_user`, `ix_members_user` — resolución de membresías.
- `ux_clients_org_code`, `ux_clients_org_identification` (parcial), `ix_clients_org_name`.
- `ix_loans_org_status`, `ix_loans_org_client`.
- `ix_installments_org_due`, `ix_installments_org_loan`.
- `ux_installments_loan_version_number` — evita duplicar cuotas.
- `ix_payments_org_paid_at`, `ix_payments_org_loan`.
- `ux_payment_reversals_payment` — una reversión por pago.
- `ix_audit_logs_org`, `ix_audit_logs_entity`.

## Aislamiento por tenant

- `org_id` es obligatorio en todas las tablas operativas.
- Los repositorios reciben el `orgId` resuelto por la sesión y lo incluyen en el `WHERE`.
- Los recursos ajenos devuelven 404.
- La FK `ON DELETE CASCADE` desde `organizations` permite eliminar un tenant completo en un procedimiento administrativo controlado (no expuesto en la UI).

## Migraciones

```bash
npm run db:migrate:local    # base local de desarrollo
npm run db:migrate:remote   # D1 remoto (requiere wrangler autenticado)
```

**Producción**: revisar el SQL, hacer backup (export de D1 o Time Travel) y aplicar en ventana controlada. Nunca aplicar `DROP` sin autorización.

## Datos de demostración

`seeds/demo.sql` crea una organización de ejemplo con clientes, préstamos y pagos. Solo para desarrollo local; no se ejecuta en producción.
