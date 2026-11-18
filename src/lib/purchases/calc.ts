// Cálculos de compras en CENTAVOS y MILÉSIMAS (enteros), igual que la caja.
// Se usa en el navegador (vista previa de la orden) y en el servidor (al guardar y recibir),
// por eso aquí no se importa nada de Prisma.

export type PurchaseLineInput = {
  /** Cantidad en milésimas (1 unidad = 1000) */
  quantity: number;
  /** Costo unitario en centavos */
  unitCost: number;
};

/** Total de una línea: cantidad × costo, redondeado al centavo. */
export const purchaseLineTotal = (l: PurchaseLineInput) => Math.round((l.quantity * l.unitCost) / 1000 + Number.EPSILON);

/** Totales de la orden en centavos. */
export function computePurchase(lines: PurchaseLineInput[]) {
  const totals = lines.map(purchaseLineTotal);
  const total = totals.reduce((s, t) => s + t, 0);
  return { lines: totals, total };
}

/**
 * Costo promedio ponderado después de recibir una compra, en centavos.
 *
 *   (existencia × costo actual + cantidad comprada × costo de compra)
 *   ─────────────────────────────────────────────────────────────────
 *               existencia + cantidad comprada
 *
 * - `stock` es la existencia total del producto (todas las sucursales) ANTES de recibir, en milésimas.
 * - Si no había existencia (0 o negativa), el costo nuevo es el de la compra: no tiene
 *   sentido promediar contra unidades que no existen.
 */
export function weightedAverageCost(opts: { stock: number; currentCost: number; quantity: number; unitCost: number }) {
  const { stock, currentCost, quantity, unitCost } = opts;
  if (quantity <= 0) return currentCost;
  if (stock <= 0) return unitCost;
  return Math.round((stock * currentCost + quantity * unitCost) / (stock + quantity) + Number.EPSILON);
}

/** Convierte un decimal de la base ("12.50", "1.5") a centavos / milésimas. */
export const decimalToCents = (v: { toString(): string }) => Math.round(Number(v.toString()) * 100);
export const decimalToMilli = (v: { toString(): string }) => Math.round(Number(v.toString()) * 1000);
