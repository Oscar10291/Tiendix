"use server";

import { Prisma, SaleStatus, StockMovementType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { applyStockMovement } from "@/lib/inventory/stock";
import { canAccessSale } from "@/lib/pos/cash";

export type CancelState = { error?: string; ok?: boolean };

/**
 * Anula una venta (solo gerente o administrador). Devuelve al stock lo que se vendió
 * con un movimiento "Devolución de cliente" en el kárdex, ligado a la venta.
 * La venta no se borra: queda marcada como anulada, con quién, cuándo y por qué.
 */
export async function cancelSale(_prev: CancelState, formData: FormData): Promise<CancelState> {
  const session = await requirePermission("sales:cancel");
  const id = String(formData.get("saleId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  if (reason.length < 3) return { error: "Escribe el motivo de la anulación." };

  const sale = await prisma.sale.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
  if (!sale || !canAccessSale(session, sale)) return { error: "No se encontró la venta." };
  if (sale.status !== SaleStatus.COMPLETED) return { error: "Esta venta ya estaba anulada." };

  const done = await prisma.$transaction(async (tx) => {
    // Si el turno sigue abierto, se bloquea para que el arqueo no se calcule a medias
    if (sale.cashSessionId) await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${sale.cashSessionId} FOR UPDATE`;

    // Cambio de estado condicionado: si dos personas anulan a la vez, solo una gana
    const changed = await tx.sale.updateMany({
      where: { id: sale.id, status: SaleStatus.COMPLETED },
      data: { status: SaleStatus.CANCELLED, cancelledAt: new Date(), cancelledById: session.user.id, cancelReason: reason },
    });
    if (changed.count === 0) return false;

    // Devuelve el stock (sumando por producto, en orden fijo)
    const back = new Map<string, Prisma.Decimal>();
    for (const it of sale.items) {
      if (!it.product.trackStock) continue;
      back.set(it.productId, (back.get(it.productId) ?? new Prisma.Decimal(0)).plus(it.quantity));
    }
    for (const productId of [...back.keys()].sort()) {
      const item = sale.items.find((i) => i.productId === productId)!;
      await applyStockMovement(tx, {
        type: StockMovementType.SALE_RETURN,
        branchId: sale.branchId,
        productId,
        userId: session.user.id,
        delta: back.get(productId)!,
        unitCost: item.unitCost,
        reason: "ANULACION_VENTA",
        note: `Venta #${sale.number}: ${reason}`,
        saleId: sale.id,
      });
    }
    return true;
  });
  if (!done) return { error: "Esta venta ya estaba anulada." };

  revalidatePath(`/ventas/${sale.id}`);
  revalidatePath("/ventas");
  revalidatePath("/inventario");
  return { ok: true };
}
