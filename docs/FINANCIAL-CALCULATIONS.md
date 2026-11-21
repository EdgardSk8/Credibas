# Cálculos financieros

Todo el motor vive en `src/shared/finance` y es puro (sin I/O), por lo que el cliente puede previsualizar exactamente el mismo resultado que guarda el backend.

## Unidades y redondeo

- **Importes**: enteros en la unidad menor (centavos). `C$ 1,234.56` → `123456`.
- **Tasas**: puntos base por período. `5 %` → `500` bps.
- **Aritmética**: `decimal.js` con 28 dígitos de precisión.
- **Redondeo**: `HALF_UP` a centavos, una sola vez por cálculo.
- **Residuos**: al dividir un total entre cuotas, los centavos sobrantes se reparten uno por cuota desde la primera (`divideCents`). La suma de las partes siempre es exactamente el total.

## Fechas

- Fechas de negocio como `YYYY-MM-DD` en UTC, sin hora, para evitar corrimientos por zona horaria.
- Frecuencias:
  - Diaria: +1 día.
  - Semanal: +7 días.
  - Quincenal: +14 días.
  - Mensual: +1 mes con ajuste al último día del mes destino (`31 ene → 28/29 feb`).
  - Personalizada: +N días (1–365).
- La primera cuota vence en la fecha indicada; no puede ser anterior al desembolso (validado en backend y en formulario).

## Métodos de amortización

### 1. Interés plano (`flat_interest`)

El interés se calcula sobre el capital inicial durante todo el plazo.

```
interés total = capital × tasa × n
cuota         = (capital + comisión) / n + interés total / n
```

- Capital por cuota constante; interés por cuota constante.
- La tasa anualizada mostrada es `tasa × períodos por año`.

### 2. Cuota fija / anualidad (`fixed_installment`)

Interés sobre saldo insoluto con pago constante.

```
i = tasa por período
cuota teórica = P × i / (1 − (1 + i)^−n)
interés_k = round(saldo × i)
capital_k = cuota − interés_k
saldo_k   = saldo_(k−1) − capital_k
```

- Si la cuota redondeada no cubre el interés del período, se rechaza con `negative_amortization` (evita amortización negativa silenciosa).
- La última cuota ajusta el capital al saldo restante para cerrar en cero exacto.
- Caso de referencia (probado): `P = 5.000.000` centavos, `i = 450` bps, `n = 12` → interés total `1.769.526` centavos, saldo final `0`.

### 3. Capital constante (`declining_principal`)

```
capital_k = P / n (reparto exacto con residuos)
interés_k = round(saldo_(k−1) × i)
cuota_k   = capital_k + interés_k
```

- Cuota decreciente; útil cuando el cliente quiere pagar menos interés total.
- Si la tasa es 0, coincide con cuota fija sin intereses.

## Comisiones

- `feeCents` es el total de comisión y se reparte entre las cuotas con el mismo criterio de residuos.
- Se muestra en cada cuota y suma al total a pagar.
- No se incluye en el capital ni genera interés.

## Mora

Mora simple, sin capitalización:

```
mora = saldo_vencido × (mora_diaria_bps / 10.000) × días_vencidos
días_vencidos = max(0, fecha_actual − fecha_vencimiento − días_de_gracia)
saldo_vencido = total_cuota − pagos_aplicados (capital + interés + comisión)
```

- Redondeo `HALF_UP` a centavos.
- Ejemplo probado: cuota de `100.000`, pagada `40.000`, mora diaria `50` bps (0,5 %), 2 días de gracia, 10 días de atraso → `60.000 × 0,005 × 8 = 2.400` centavos.
- La mora acumulada se recalcula en cada cobro y en el job diario; nunca se cobra dos veces porque al pagar se descuenta de `late_fee_accrued_cents`.

## Distribución de pagos

Orden por defecto (configurable por organización en Configuración):

```
mora → interés → capital → comisión
```

Algoritmo:

1. Se ordenan las cuotas abiertas por fecha de vencimiento (la más antigua primero).
2. Para cada cuota se aplica el monto disponible en el orden configurado, sin superar el saldo de cada componente.
3. Si el pago no alcanza para toda la deuda, queda aplicado hasta donde llegue; el remanente se reporta (`unappliedCents`).
4. Si el pago excede la deuda total, el backend lo rechaza (no se aceptan sobrantes sin destino).

Ejemplo probado: cuota de `100.000` (capital `90.000`, interés `10.000`), mora `2.000`, pago `50.000` →
mora `2.000` + interés `10.000` + capital `38.000`.

## Abonos a capital

- `mode: 'capital'` aplica el monto solo al capital de las cuotas más antiguas.
- Después del abono, el backend **reamortiza** el saldo insoluto: crea una nueva versión del calendario con el capital restante, el mismo número de cuotas abiertas, la misma tasa y el siguiente vencimiento.
- Las cuotas impagas anteriores quedan como `restructured`; los pagos se conservan íntegros.
- Todo queda en `loan_adjustments` + `audit_logs`.

## Reestructuración

- Solo sobre saldo insoluto (capital pendiente de cuotas abiertas).
- Genera nueva versión (`loan_schedule_versions`) y marca las cuotas impagas previas como `restructured`.
- Nunca reescribe cuotas pagadas ni el historial de pagos.
- Parámetros ajustables: número de cuotas, tasa y primer vencimiento.

## Estados

| Cuota | Significado |
| --- | --- |
| `pending` | Abierta, aún no vence. |
| `partial` | Tiene pagos parciales. |
| `paid` | Capital + interés + comisión cubiertos. |
| `overdue` | Venció sin cubrirse. |
| `restructured` | Reemplazada por una versión nueva del calendario. |
| `cancelled` | Anulada con el préstamo. |

| Préstamo | Significado |
| --- | --- |
| `active` | Vigente con cuotas abiertas. |
| `settled` | Todas las cuotas pagadas (se marca en la misma transacción del pago). |
| `cancelled` | Anulado sin pagos (o tras revertirlos). |
| `restructured` | Reservado para estados operativos futuros. |
| `defaulted` | Reservado para cartera en cobro judicial. |

## Verificación

`tests/unit/finance.test.ts` cubre:

- Suma de meses con fin de mes y días.
- Parseo de montos con separadores.
- Reparto exacto de residuos.
- Interés plano, cuota fija y capital constante (sumas exactas y saldo cero).
- Rechazo de tasas/capital inválidos y amortización negativa.
- Mora con y sin gracia.
- Distribución por orden, remanente y avance a la siguiente cuota.
- Abono a capital.
