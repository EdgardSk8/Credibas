# Despliegue

> Este documento describe el procedimiento completo. El repositorio está listo para desplegar, pero **los recursos reales de Cloudflare todavía no han sido creados** (los IDs en `wrangler.jsonc` son marcadores).

## 1. Requisitos

- Cuenta de Cloudflare con Workers Paid (D1, Queues y Cron lo requieren para cargas reales).
- `wrangler` autenticado: `npx wrangler login`.
- Dominio (opcional al inicio; se puede usar `*.workers.dev`).

## 2. Crear recursos

```bash
# Base de datos
npx wrangler d1 create credibas-db
# Copia el database_id y reemplaza REPLACE_WITH_D1_DATABASE_ID en wrangler.jsonc

# Almacenamiento
npx wrangler r2 bucket create credibas-files

# Colas
npx wrangler queues create credibas-jobs
npx wrangler queues create credibas-jobs-dlq
```

Verifica en `wrangler.jsonc`:

- `d1_databases[0].database_id`
- `r2_buckets[0].bucket_name`
- `queues.producers` y `queues.consumers`
- `triggers.crons` (`*/15 * * * *` y `0 13 * * *`)

## 3. Migraciones

```bash
# Ensayo local
npm run db:migrate:local

# Producción (con backup previo)
npx wrangler d1 export credibas-db --remote --output backup-$(date +%Y%m%d).sql
npm run db:migrate:remote
```

La migración `0002_seed.sql` inserta permisos, planes y límites. Es idempotente por diseño (solo se ejecuta una vez por D1).

## 4. Secretos

```bash
npx wrangler secret put TURNSTILE_SECRET       # secreto del widget de Turnstile
npx wrangler secret put MAIL_RELAY_URL          # si EMAIL_PROVIDER=relay (ver EMAIL-RELAY.md)
npx wrangler secret put MAIL_RELAY_SECRET       # si EMAIL_PROVIDER=relay
npx wrangler secret put RESEND_API_KEY          # si EMAIL_PROVIDER=resend
npx wrangler secret put BILLING_WEBHOOK_SECRET  # cuando exista proveedor
```

La site key pública de Turnstile va como var en `wrangler.jsonc` (`TURNSTILE_SITE_KEY`); el cliente la obtiene de `/api/public/config`.

Detalle en [ENVIRONMENT.md](ENVIRONMENT.md).

## 5. Primer administrador de plataforma

Después de registrar tu cuenta y verificar el correo:

```bash
npx wrangler d1 execute credibas-db --remote \
  --command "UPDATE users SET is_platform_admin = 1 WHERE email = 'tu@correo.com'"
```

El panel estará en `/admin`.

## 6. Despliegue

```bash
npm run deploy          # build + wrangler deploy
npm run deploy:version  # version upload (sin promover)
```

El build genera:

- `dist/client` — SPA con assets, fuentes y `_headers`.
- `dist/credibas` — Worker (API, cron, queue).

## 7. Dominio y DNS

1. En Cloudflare Dashboard → Workers → `credibas` → Settings → Domains & Routes.
2. Añade `credibas.app` y `www.credibas.app` (o el dominio elegido).
3. Actualiza `APP_URL` en `wrangler.jsonc` y vuelve a desplegar.
4. Configura Turnstile para el dominio nuevo y actualiza el secreto.

## 8. GitHub Actions

Los workflows están en `.github/workflows`:

- `ci.yml`: en cada push y PR ejecuta typecheck, lint, tests y build.
- `deploy.yml`: al hacer push a `main`, despliega a producción; en PRs publica una versión de preview (requiere configurar los secretos del repositorio).

Secretos requeridos en GitHub:

| Secreto | Uso |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token con permisos de Workers, D1, R2 y Queues |
| `CLOUDFLARE_ACCOUNT_ID` | ID de la cuenta |

## 8.1 Sitio de pruebas en Cloudflare Pages

`https://credibas.pages.dev` es el entorno de pruebas conectado al repositorio `EdgardSk8/Credibas`.

- Proyecto Pages: `credibas`, rama de producción: `preview`. Cada push a `preview` reconstruye el sitio automáticamente; `main` queda reservado para el Worker de producción.
- Build: `npm run build`, salida `dist/client`, Node 22.
- API: `functions/api/[[route]].ts` reutiliza la misma app Hono del Worker.
- Bindings: D1 `credibas-db` (la base de producción) y R2 `credibas-files`. Pages no soporta Queues ni Cron; `enqueueJob` omite los envíos a cola en ese entorno.
- Variables y secretos: los mismos del Worker, con `APP_URL=https://credibas.pages.dev`. Se administran en el dashboard de Pages (Settings → Variables and Secrets).

## 9. Verificación post-despliegue

1. `GET /api/public/health` responde `ok: true`.
2. Registro + verificación de correo + login.
3. Crear negocio, cliente, préstamo y pago.
4. Revisar que la cartera y los reportes cuadren.
5. Probar un cron manualmente (`wrangler dev --test-scheduled` en local) o revisar logs del Worker.
6. Confirmar que Turnstile está activo (sin token, el registro debe fallar).

## 10. Rollback

- Workers: `npx wrangler rollback` (versión anterior).
- D1: restaurar con Time Travel (`wrangler d1 time-travel restore`) o desde el export.
- Nunca revertir una migración con `DROP` en producción sin autorización y backup.

## Checklist de producción

- [ ] IDs reales en `wrangler.jsonc`
- [ ] Secretos configurados
- [ ] Migraciones aplicadas
- [ ] Primer administrador designado
- [ ] Dominio y `APP_URL` actualizados
- [ ] Turnstile verificado
- [ ] Copia de seguridad y restauración probadas
- [ ] Revisión legal de términos y privacidad
- [ ] Proveedor de pagos integrado y webhook firmado probado
- [ ] Monitoreo y alertas revisados
