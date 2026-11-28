# Variables de entorno

## Desarrollo local

Crea `.dev.vars` (ignorado por git) a partir de `.dev.vars.example`:

```ini
APP_ENV=development
APP_URL=http://localhost:5173
EMAIL_PROVIDER=console
PASSWORD_ITERATIONS=100000
# TURNSTILE_SITE_KEY=1x00000000000000000000AA
# TURNSTILE_SECRET=1x0000000000000000000000000000000AA
# RESEND_API_KEY=
# EMAIL_FROM=no-reply@credibas.app
# EMAIL_FROM_NAME=Credibas
# MAIL_RELAY_URL=https://script.google.com/macros/s/XXXX/exec
# MAIL_RELAY_SECRET=secreto-de-32-o-mas-caracteres
# BILLING_WEBHOOK_SECRET=
```

Con `EMAIL_PROVIDER=console`, los correos se imprimen en la consola del servidor (incluido el código de verificación): no se envía nada real. Con `EMAIL_PROVIDER=relay` se envían por un relay HTTP propio de Google Apps Script + Gmail; ver [EMAIL-RELAY.md](EMAIL-RELAY.md).

## Variables y bindings

| Nombre | Tipo | Obligatoria | Descripción |
| --- | --- | --- | --- |
| `DB` | Binding D1 | Sí | Base de datos principal. |
| `FILES` | Binding R2 | Sí | Documentos de clientes y comprobantes. |
| `JOBS` | Binding Queue | Sí | Cola de trabajos asíncronos. |
| `EMAIL` | Binding Email Service | No | Solo si `EMAIL_PROVIDER=cloudflare`. |
| `ASSETS` | Binding Assets | Auto | Lo inyecta el plugin de Vite. |
| `APP_ENV` | Var | Sí | `development`, `staging`, `production`. En `production` Turnstile es obligatorio. |
| `APP_NAME` | Var | No | Nombre visible. |
| `APP_URL` | Var | Sí | Origen público canónico; se usa en enlaces de correo y validación CSRF. |
| `EMAIL_PROVIDER` | Var | Sí | `console`, `cloudflare`, `resend` o `relay`. |
| `PAYMENTS_PROVIDER` | Var | Sí | `manual` (sin cobro automático) o `lafise`. Ver [PAGOS-LAFISE.md](PAGOS-LAFISE.md). |
| `TURNSTILE_SECRET` | Secret | Producción | Clave secreta de Turnstile. Sin ella, el registro falla cerrado en producción. |
| `TURNSTILE_SITE_KEY` | Var | Producción | Site key pública del widget; el cliente la obtiene de `/api/public/config`. |
| `RESEND_API_KEY` | Secret | No | Requerida si `EMAIL_PROVIDER=resend`. |
| `EMAIL_FROM` | Var/Secret | No | Remitente verificado del dominio. |
| `EMAIL_FROM_NAME` | Var | No | Nombre del remitente. |
| `MAIL_RELAY_URL` | Secret | No | URL `/exec` del relay de Apps Script; requerida si `EMAIL_PROVIDER=relay`. |
| `MAIL_RELAY_SECRET` | Secret | No | Secreto compartido con el relay; requerido si `EMAIL_PROVIDER=relay`. |
| `PASSWORD_ITERATIONS` | Var | No | Iteraciones PBKDF2. Por defecto 100.000. En pruebas se baja a 10.000. |
| `BILLING_WEBHOOK_SECRET` | Secret | No | Secreto HMAC para webhooks de facturación. |
| `LAFISE_API_BASE` | Secret | No | Base de la API del banco. Sin ella, el adaptador LAFISE no cobra. |
| `LAFISE_MERCHANT_ID` | Secret | No | Identificador de comercio (cuenta central de Credibas). |
| `LAFISE_API_KEY` | Secret | No | Clave de la API de LAFISE. |
| `LAFISE_WEBHOOK_SECRET` | Secret | No | Secreto para verificar notificaciones del banco (pendiente de documentación). |

## Configurar secretos en producción

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MAIL_RELAY_URL
npx wrangler secret put MAIL_RELAY_SECRET
npx wrangler secret put BILLING_WEBHOOK_SECRET
```

Para entornos separados:

```bash
npx wrangler secret put TURNSTILE_SECRET --env staging
```

## Notas

- Nunca subas `.dev.vars`, `.env` ni claves al repositorio.
- Las variables no secretas pueden vivir en `wrangler.jsonc` (`vars`).
- Si cambias `APP_URL`, actualiza también el dominio del sitio y la configuración de Turnstile.
- `PASSWORD_ITERATIONS` por debajo de 10.000 se ignora y se usa el valor por defecto.
