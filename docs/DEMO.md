# Cuenta de demostración

La organización **Financiera Demo** sirve para que cualquier visitante explore Credibas
sin crear cuenta. Se abre desde el botón **Ver demo** de la portada.

## Cómo funciona

1. El visitante pulsa **Ver demo**.
2. `POST /api/public/demo` busca la organización con slug `financiera-demo`, elige un
   miembro **sin privilegios de plataforma** y crea una sesión marcada como demo
   (`sessions.is_demo = 1`, 8 horas de vigencia, 20 solicitudes por IP cada 10 minutos).
3. La sesión entra directamente al panel con todos los datos de la demo.

**La demo es de solo lectura.** El middleware `blockDemoWrites` rechaza cualquier
método distinto de `GET`/`HEAD` con el código `demo_read_only`, excepto cerrar sesión
y volver a pedir la demo. La restricción se aplica en el servidor, no solo en la
interfaz. Además, una sesión de demo nunca entra al panel de plataforma (`/admin`).

## Cuentas

| Cuenta | Uso |
| --- | --- |
| `demo@credibas.app` / `Demo2026x` | Cuenta de trabajo local. Es administradora de plataforma. |
| `demo.invitado@credibas.app` | Identidad de la demo pública. Sin privilegios de plataforma y sin contraseña útil. |
| `supervisor@credibas.app` | Miembro con rol Supervisor (cartera y cobros). |
| `cobrador@credibas.app` | Miembro con rol Cobrador. |

## Datos que incluye

- **12 clientes** con identificación, teléfono, dirección, referencias y notas.
- **12 préstamos** con estados `active`, `settled` y `defaulted`, en cuatro frecuencias
  (semanal, quincenal, mensual) y dos métodos de interés (plano y saldo insoluto).
- **120 cuotas** con estados `pending`, `partial`, `paid` y `overdue`, incluida mora.
- **Pagos** con su distribución entre capital e interés, y **movimientos de caja**
  enlazados a cada cobro, más dos gastos.
- **Dos cajas**: una cerrada y una abierta.
- **Gestión de cobro**: tres carteras asignadas y seis gestiones (llamadas, visitas,
  mensajes y promesas de pago).
- **Notificaciones** de recordatorio, mora, asignación y pago.
- **Facturación**: tres facturas pagadas del plan Professional con sus pagos.

## Regenerar los datos

El SQL se genera, no se edita a mano:

```bash
npm run db:seed:build   # regenera seeds/demo.sql
npm run db:seed:demo    # aplica en la base local
```

El generador ([scripts/generate-demo-seed.mjs](../scripts/generate-demo-seed.mjs))
calcula los calendarios y valida que la suma de cuotas coincida con el total del
préstamo. Las fechas se emiten relativas a `date('now')`, así que la demo siempre
queda al día. El seed borra y reconstruye **solo** los datos de la organización de
demostración.

## Publicar la demo

```bash
npm run db:migrate:remote
npx wrangler d1 execute credibas-db --remote --file=./seeds/demo.sql
```

## Pendiente

- El panel de plataforma cuenta la suscripción de la demo como ingreso real. Si la
  demo se publica en producción, conviene excluirla de las métricas de facturación.
- Cuando exista tokenización de tarjetas (ver [PAGOS-LAFISE.md](./PAGOS-LAFISE.md)),
  la demo podrá mostrar un método de pago de ejemplo.
