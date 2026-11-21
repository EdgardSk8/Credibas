# Seguridad

## Controles implementados

### Autenticación

- **PBKDF2-SHA256** con WebCrypto: 600.000 iteraciones por defecto, sal de 16 bytes por usuario, clave derivada de 32 bytes. No se implementa criptografía propia.
- Comparación de hashes en tiempo constante.
- Contraseña mínima: 10 caracteres con al menos una letra y un número (validado en cliente y servidor).
- **Bloqueo progresivo**: 5 intentos fallidos en 15 minutos bloquean el acceso temporalmente por correo o IP.
- **Rate limiting** atómico en D1 (`INSERT … ON CONFLICT … RETURNING`) por IP y por identificador.

### Sesiones

- Token opaco de 256 bits; en D1 solo se almacena su SHA-256.
- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` cuando la petición es HTTPS, `Path=/`, 30 días.
- Expiración absoluta, revocación individual y global ("cerrar otras sesiones").
- Rotación de contraseña revoca todas las sesiones.
- `last_used_at` se actualiza como máximo cada 5 minutos para reducir escrituras.

### Verificación y recuperación

- Tokens de un solo uso, aleatorios, hasheados en reposo.
- Verificación de correo: 24 h. Recuperación: 1 h.
- El consumo es atómico (`UPDATE … RETURNING`), por lo que un token no puede usarse dos veces ni en solicitudes concurrentes.
- La solicitud de recuperación responde igual exista o no el correo (evita enumeración).

### CSRF y CORS

- Métodos mutables (`POST`, `PUT`, `PATCH`, `DELETE`) validan `Origin` y, si falta, `Referer` contra el host real y `APP_URL`.
- Cookies `SameSite=Lax` como segunda barrera.
- Sin CORS abierto: la API se consume desde el mismo origen.
- Webhooks exentos de CSRF, protegidos por firma HMAC-SHA256.

### Autorización

- Permisos atómicos verificados en el backend (`requirePermission`).
- La organización activa proviene de la sesión; nunca de un header o body del cliente.
- Recursos de otras organizaciones devuelven **404** (no 403) para no filtrar existencia.
- El panel de plataforma exige `users.is_platform_admin = 1`; un usuario normal recibe 404.

### Validación y entradas

- Todos los cuerpos y parámetros se validan con Zod antes de tocar la base.
- Consultas SQL siempre parametrizadas (sin interpolación de valores).
- Listas de ordenamiento por whitelist (`SORTABLE`) para evitar inyección por `ORDER BY`.
- React escapa por defecto; no se usa `dangerouslySetInnerHTML`.
- Archivos: tipo MIME en whitelist, máximo 10 MB, nombre saneado, clave aleatoria en R2 y descarga autenticada con `Content-Disposition: attachment`.

### Cabeceras

- API: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, `Cache-Control: no-store`.
- Assets estáticos: CSP estricta (`default-src 'self'`, sin scripts inline), `frame-ancestors 'none'`, HSTS.

### Datos financieros

- Importes en enteros; operaciones multi-tabla en `batch` atómico.
- Pagos confirmados no se eliminan: reversión con motivo, responsable, fecha y auditoría.
- `payment_reversals` tiene índice único por pago.
- `audit_logs` registra acción, entidad, antes/después, IP y user agent.
- Los logs de aplicación no incluyen contraseñas, tokens, números de tarjeta ni montos asociados a personas.

### Secretos

- Nunca en el repositorio. `.dev.vars` está ignorado.
- En producción se cargan con `wrangler secret put`.
- El panel no muestra secretos; solo indica si están configurados.

## Modelo de amenazas (resumen)

| Amenaza | Mitigación |
| --- | --- |
| Acceso cruzado entre negocios | `org_id` de sesión + pruebas de aislamiento |
| Robo de sesión | Cookie HttpOnly/Secure, token hasheado, revocación |
| Fuerza bruta | Rate limit + bloqueo progresivo + Turnstile |
| CSRF | Validación de origen + SameSite |
| XSS | Escape de React + CSP + sin HTML dinámico |
| Inyección SQL | Consultas parametrizadas + whitelists |
| Archivos maliciosos | MIME whitelist, tamaño, descarga forzada |
| Webhook falso | HMAC-SHA256 + idempotencia por `provider_ref` |
| Repudio de pagos | Auditoría + reversión trazable |
| Abuso de límites de plan | Límites en D1 verificados en backend |
| Enumeración de cuentas | Respuestas genéricas en recuperación |

## Riesgos abiertos y siguientes pasos

1. **Turnstile**: en desarrollo se omite si no hay secreto; en producción se falla cerrado. Falta configurar el secreto real y probar el flujo completo.
2. **Proveedor de pagos**: el webhook está listo, pero falta integrar un proveedor que acepte negocios en Nicaragua y verificar su disponibilidad y requisitos actuales.
3. **2FA**: no implementado. Recomendado para propietarios y administradores.
4. **Backups**: D1 ofrece Time Travel; falta documentar el procedimiento operativo y probar una restauración.
5. **Concurrencia de pagos**: ver limitación en [ARCHITECTURE.md](ARCHITECTURE.md#integridad-transaccional). Próximo paso: bloqueo optimista por versión de préstamo.
6. **Revisión legal**: términos y privacidad requieren validación de un abogado antes de comercializar.
7. **Pentest**: pendiente antes de producción con datos reales.

## Reporte de vulnerabilidades

Escribe a `seguridad@credibas.app` con pasos de reproducción. No publiques detalles antes de recibir respuesta.
