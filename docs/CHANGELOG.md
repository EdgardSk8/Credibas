# Changelog

Todas las fechas en formato ISO (YYYY-MM-DD).

## [0.1.0] — 2026-11-21

Primera entrega funcional: fundación completa de Credibas.

### Añadido

- **Identidad y sitio público**: landing con hero, bento de funcionalidades, cómo funciona, vista previa de calendario, seguridad, precios, FAQ y CTA; páginas de funcionalidades, precios, contacto, términos y privacidad; 404.
- **Sistema visual**: tokens de marca (`#101817`, `#35D6A0`, `#F0F4F2`), tipografías Sora/Manrope autoalojadas, componentes (botones, campos, badges, tablas, modales, toasts, paginación, vacíos, skeletons), layouts público y privado, responsive verificado sin desbordes.
- **Logotipo CB** geométrico en SVG (monograma integrado C+B), favicon y manifiesto.
- **Autenticación**: registro, verificación de correo, login, logout, recuperación y restablecimiento de contraseña, cambio de contraseña, gestión de sesiones, invitaciones.
- **Multi-tenancy**: organizaciones, membresías, cinco roles del sistema con permisos atómicos, aislamiento verificado por pruebas.
- **Clientes**: CRUD con búsqueda, filtros, paginación, referencias, notas, estado, estadísticas y documentos en R2.
- **Préstamos**: motor financiero (interés plano, cuota fija, capital constante), frecuencias diaria a mensual y personalizada, vista previa del calendario, comisiones, mora, gracia, reestructuración versionada, cancelación.
- **Cuotas**: calendario por préstamo, vista global con filtros por estado y fecha, mora acumulada.
- **Pagos**: registro con distribución automática (mora → interés → capital → comisión), abonos a capital con reamortización, comprobante por correo, reversión auditada.
- **Cobros**: agenda por rango de días, asignaciones a cobradores, gestiones y promesas de pago.
- **Caja**: apertura, movimientos automáticos por pago/desembolso, movimientos manuales, cierre con arqueo y diferencia.
- **Reportes**: dashboard con KPIs reales, colocación vs. cobranza, próximos vencimientos, actividad reciente; cartera, morosidad, envejecimiento, pagos por período y flujo de caja; exportación CSV.
- **Suscripciones**: planes y límites en base de datos, motor de límites centralizado, cambio de plan, cancelación/reanudación, facturas, pagos manuales y webhook firmado idempotente.
- **Panel de plataforma**: resumen global con MRR/ARR, organizaciones con consumo y estado, gestión de planes y límites, confirmación de pagos.
- **Infraestructura**: `wrangler.jsonc` con D1, R2, Queues y Cron; migraciones versionadas; colas para correo, recordatorios y limpieza; cron de vencimientos y mora.
- **Seguridad**: PBKDF2, sesiones hasheadas, CSRF por origen, rate limiting, bloqueo progresivo, headers, validación Zod, auditoría, uploads validados.
- **Pruebas**: 21 pruebas (motor financiero, fechas, dinero, mora, distribución, aislamiento multi-tenant, ciclo de pagos y reversión) ejecutadas en el runtime de Workers.
- **Documentación**: README, ARCHITECTURE, DATABASE, FINANCIAL-CALCULATIONS, SECURITY, DEPLOYMENT, ENVIRONMENT, SUBSCRIPTIONS y este CHANGELOG.

### Pendiente

- Crear recursos reales de Cloudflare y desplegar.
- Integrar proveedor de pagos compatible con Nicaragua (previa verificación).
- Exportación PDF/XLSX (hoy CSV y vista imprimible).
- Notificaciones por WhatsApp.
- 2FA para roles administrativos.
- Estudio de mercado para validar precios.
- Revisión legal de términos y privacidad.
