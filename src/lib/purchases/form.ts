// Solo para el servidor: arma los valores del formulario de compra desde la base.
import { prisma } from "@/lib/prisma";
import { TIME_ZONE } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import type { PurchaseLine } from "@/app/(app)/compras/purchase-form";

/** Líneas del formulario a partir de las de una orden existente (editar o repetir pedido). */
export async function linesFromPurchase(purchaseId: string, branchId: string, opts: { onlyActive?: boolean } = {}): Promise<PurchaseLine[]> {
  const items = await prisma.purchaseItem.findMany({
    where: { purchaseId },
    orderBy: { id: "asc" },
    include: { product: { include: { stock: { where: { branchId } } } } },
  });
  return items
    .filter((i) => !opts.onlyActive || (i.product.active && i.product.trackStock))
    .map((i) => ({
      product: {
        id: i.product.id,
        name: i.product.name,
        sku: i.product.sku,
        unit: UNIT_LABELS[i.product.unit].short,
        cost: i.product.cost.toString(),
        stock: (i.product.stock[0]?.quantity ?? 0).toString(),
        minStock: i.product.minStock.toString(),
      },
      quantity: i.quantity.toString(),
      // Al repetir un pedido se propone el último costo pagado
      unitCost: i.unitCost.toString(),
    }));
}

/** Proveedores para elegir: activos + el actual de la orden (aunque esté inactivo). */
export function supplierOptions(currentId?: string) {
  return prisma.supplier.findMany({
    where: { OR: [{ active: true }, ...(currentId ? [{ id: currentId }] : [])] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Fecha de la base como "2026-11-17" en la hora de la tienda, para <input type="date">. */
export const toDateInput = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d) : "");
