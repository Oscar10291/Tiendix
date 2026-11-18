// Cálculos de los reportes (sin Prisma, para poder probarlos con `pnpm test`).
// Los montos llegan de la base como Decimal/texto y se convierten a centavos enteros,
// así las sumas no arrastran errores de redondeo.

type Num = number | string | { toString(): string } | null | undefined;

/** Decimal de la base ("12.345") a centavos, redondeando al centavo. */
export function toCents(v: Num) {
  if (v == null) return 0;
  const n = Number(v.toString());
  return Number.isFinite(n) ? Math.round(n * 100 + (n >= 0 ? Number.EPSILON : -Number.EPSILON)) : 0;
}

/** Cantidad de la base a número (3 decimales). */
export function toQty(v: Num) {
  if (v == null) return 0;
  const n = Number(v.toString());
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

/** Centavos a quetzales para mostrar o exportar. */
export const fromCents = (c: number) => c / 100;

/** Margen sobre la venta: utilidad ÷ venta (0.25 = 25 %). null si no hubo venta. */
export function margin(profitCents: number, revenueCents: number) {
  return revenueCents > 0 ? profitCents / revenueCents : null;
}

/** Ticket promedio en centavos. */
export const averageTicket = (totalCents: number, count: number) => (count > 0 ? Math.round(totalCents / count) : 0);

/** Variación porcentual contra un período anterior (0.1 = +10 %). null si antes no hubo nada. */
export function change(current: number, previous: number) {
  return previous !== 0 ? (current - previous) / Math.abs(previous) : null;
}

/**
 * Venta, impuesto, costo y utilidad de un grupo de ventas.
 * - `total`: lo cobrado (con impuesto, ya con todos los descuentos).
 * - `tax`: impuesto incluido en lo cobrado.
 * - `cost`: costo de lo vendido al costo promedio de ese momento.
 * Utilidad bruta = venta sin impuesto − costo.
 */
export function profitOf(totals: { total: number; tax: number; cost: number }) {
  const net = totals.total - totals.tax;
  const profit = net - totals.cost;
  return { net, profit, margin: margin(profit, net) };
}

/** Parte del impuesto incluido en un monto con impuesto (12 % → 12/112 del monto). */
export function includedTax(amountCents: number, ratePercent: number) {
  return ratePercent > 0 ? Math.round((amountCents * ratePercent) / (100 + ratePercent)) : 0;
}

/** Faltante sugerido para llegar al mínimo (nunca negativo). */
export function shortfall(quantity: number, min: number) {
  return Math.max(0, Math.round((min - quantity) * 1000) / 1000);
}

/** Resumen de arqueos: suma faltantes y sobrantes por separado (no se compensan entre sí). */
export function cashDifferenceSummary(differencesCents: number[]) {
  let short = 0;
  let over = 0;
  let exact = 0;
  for (const d of differencesCents) {
    if (d < 0) short += d;
    else if (d > 0) over += d;
    else exact++;
  }
  return { short, over, net: short + over, exact, count: differencesCents.length };
}
