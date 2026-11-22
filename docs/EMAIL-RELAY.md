# Relay de correo con Gmail (sin dominio propio)

Credibas envía los códigos de verificación por un **relay HTTP propio** alojado en Google Apps Script, que envía desde una cuenta de Gmail. No requiere dominio propio, SMTP, contraseña de aplicación ni proveedor externo.

```
Worker (Credibas) ──POST (URL + secreto)──▶ Relay (Apps Script) ──▶ Gmail ──▶ Usuario
```

Variables que usa el Worker (solo en el servidor):

| Variable | Valor |
| --- | --- |
| `MAIL_RELAY_URL` | URL `/exec` que entrega Google al implementar el script. |
| `MAIL_RELAY_SECRET` | Cadena aleatoria de 32+ caracteres compartida con el script. |

## 1. Crear el relay en Apps Script

1. Entra a <https://script.google.com> con la cuenta de Gmail que enviará los correos.
2. Crea un proyecto nuevo.
3. Reemplaza el contenido de `Code.gs` con el código de abajo.
4. Genera un secreto (ver sección 2) y pégalo en `SECRET`.
5. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier persona** (la protección real es el secreto).
6. Autoriza los permisos (app no verificada: *Configuración avanzada* → *Ir a … (no seguro)* → *Permitir*).
7. Copia la URL que termina en `/exec`.

```js
const SECRET = 'CAMBIA_ESTE_VALOR_POR_UN_SECRETO_LARGO_Y_ALEATORIO'
const DEFAULT_FROM_NAME = 'tellezsoftware'

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respond({ ok: false, error: 'missing_body' })
    }

    const data = JSON.parse(e.postData.contents)
    if (typeof data.secret !== 'string' || data.secret !== SECRET) {
      return respond({ ok: false, error: 'forbidden' })
    }

    const to = String(data.to || '').trim()
    const subject = String(data.subject || '').trim()
    const html = String(data.html || '')
    const text = String(data.text || '')
    const fromName = String(data.fromName || DEFAULT_FROM_NAME).slice(0, 80)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return respond({ ok: false, error: 'invalid_to' })
    if (!subject || subject.length > 180) return respond({ ok: false, error: 'invalid_subject' })
    if (!html || html.length > 100000 || text.length > 50000) return respond({ ok: false, error: 'invalid_body' })

    MailApp.sendEmail({ to, subject, htmlBody: html, body: text, name: fromName })
    return respond({ ok: true })
  } catch (error) {
    // Nunca registrar el contenido del correo ni el código de verificación.
    console.error(error)
    return respond({ ok: false, error: 'send_failed' })
  }
}

function respond(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON)
}
```

Notas:

- `MailApp` envía siempre desde la cuenta que ejecuta el script; `name` solo cambia el nombre visible.
- Cada cambio en el código exige **Implementar → Gestionar implementaciones → editar → Nueva versión**.
- Alternativa más segura: guardar el secreto en *Configuración del proyecto → Propiedades de la secuencia de comandos* y leerlo con `PropertiesService.getScriptProperties().getProperty('SECRET')`.

## 2. Generar el secreto

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
```

Copia el resultado en `SECRET` (Apps Script) y en `MAIL_RELAY_SECRET` (Credibas). Deben ser idénticos.

## 3. Configurar Credibas

Desarrollo (`.dev.vars`, ignorado por git):

```ini
EMAIL_PROVIDER=relay
MAIL_RELAY_URL=https://script.google.com/macros/s/XXXX/exec
MAIL_RELAY_SECRET=el-mismo-secreto-del-script
```

Producción:

```bash
npx wrangler secret put MAIL_RELAY_URL
npx wrangler secret put MAIL_RELAY_SECRET
# EMAIL_PROVIDER se define en wrangler.jsonc (vars)
```

## 4. Probar el relay

```powershell
$body = @{
  secret  = 'EL_MISMO_SECRETO_DEL_SCRIPT'
  to      = 'destino@ejemplo.com'
  subject = 'Prueba de verificación'
  text    = 'Este es un correo de prueba.'
  html    = '<p>Este es un correo de prueba.</p>'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri 'https://script.google.com/macros/s/XXXX/exec' -Body $body -ContentType 'application/json'
```

Respuesta esperada: `ok = True`. El correo queda en *Enviados* de la cuenta de Gmail.

Con curl (usar `curl.exe` en PowerShell y seguir redirecciones):

```bash
curl -L -H "Content-Type: application/json" -d '{"secret":"...","to":"destino@ejemplo.com","subject":"Prueba","text":"Hola","html":"<p>Hola</p>"}' "$MAIL_RELAY_URL"
```

## 5. Flujo de verificación implementado

- Código de 6 dígitos generado con CSPRNG (`crypto.getRandomValues`).
- Solo se guarda `SHA-256(userId:código)` en `email_verification_codes`.
- Vigencia: 10 minutos. Cooldown de reenvío: 60 segundos. Máximo 5 envíos por hora.
- Máximo 5 intentos por código; al agotarse se invalida.
- Comparación en tiempo constante. El código nunca se registra en logs ni se devuelve al cliente.
- Si el relay falla, el registro no se bloquea: el usuario puede pedir un reenvío.

## 6. Problemas comunes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `{"ok":false,"error":"forbidden"}` | El secreto del script y el del Worker no coinciden | Revisar ambos valores y volver a implementar |
| Respuesta HTML o `302` | El cliente no sigue redirecciones | Usar `fetch` o `curl -L` |
| `Script function not found: doPost` | El archivo no tiene `doPost` o se publicó otra versión | Revisar el código y crear una nueva implementación |
| `{"ok":false,"error":"send_failed"}` | Cuota, dirección inválida o error interno | Revisar *Ejecuciones* en Apps Script (sin datos sensibles) |
| `Service invoked too many times: email` | Cuota diaria agotada | Esperar 24 h o cambiar de canal |
| El correo llega a spam | Falta texto plano o asunto genérico | Enviar HTML y texto (ya implementado), sin imágenes externas |
| Cambios sin efecto | Se editó el código sin crear nueva versión | Implementar → Gestionar implementaciones → Nueva versión |

## 7. Límites de Gmail y Apps Script

| Límite | Gmail normal | Google Workspace |
| --- | --- | --- |
| Destinatarios por día | ~100 | ~1.500 |
| Tiempo por ejecución | 6 minutos | 6 minutos |

Suficiente para códigos de verificación, no para correo masivo. Si necesitas más volumen o dominio propio, cambia solo el canal (`resend` o `cloudflare`) manteniendo el mismo flujo de códigos.
