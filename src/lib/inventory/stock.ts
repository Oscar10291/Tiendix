// Solo para el servidor: usa Prisma.
import { Prisma, StockMovementType } from "@prisma/client";

export class StockError extends Error {}

type MovementInput = {
  branchId: string;
  productId: string;
  type: StockMovementType;
  userId: string;
  /** Cambio en la existencia: positivo = entra, negativo = sale. Usa `setTo` para ajustes por conteo. */
  delta?: Prisma.Decimal;
  /** Existencia real contada (solo ajustes). El movimiento guarda la diferencia. */
  setTo?: Prisma.Decimal;
  unitCost?: Prisma.Decimal | null;
  reason?: string | null;
  note?: string | null;
  /** Permite que la existencia quede negativa (por defecto no). */
  allowNegative?: boolean;
  purchaseId?: string;
  saleId?: string;
};

/**
 * Registra un movimiento en el kárdex y actualiza la existencia de la sucursal.
 * Debe llamarse dentro de `prisma.$transaction(async (tx) => …)`.
 *
 * Bloquea la fila de existencia (SELECT … FOR UPDATE) para que dos movimientos
 * simultáneos del mismo producto no se pisen. Caja y compras usarán esta misma función.
 */
export async function applyStockMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  const { branchId, productId } = input;

  // Asegura que exista la fila (existencia 0 si el producto nunca tuvo stock aquí)
  await tx.stock.upsert({
    where: { branchId_productId: { branchId, productId } },
    create: { branchId, productId, quantity: 0 },
    update: {},
  });

  const [row] = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`
    SELECT quantity FROM stock WHERE "branchId" = ${branchId} AND "productId" = ${productId} FOR UPDATE`;
  const before = new Prisma.Decimal(row.quantity);

  let delta: Prisma.Decimal;
  if (input.setTo !== undefined) delta = input.setTo.minus(before);
  else if (input.delta !== undefined) delta = input.delta;
  else throw new Error("applyStockMovement: falta delta o setTo");

  if (delta.isZero()) throw new StockError("La cantidad contada es igual a la existencia actual; no hay nada que ajustar.");

  const after = before.plus(delta);
  if (after.isNegative() && !input.allowNegative) {
    throw new StockError(`No hay suficiente existencia: hay ${before.toString()} y se intentan sacar ${delta.abs().toString()}.`);
  }

  await tx.stock.update({
    where: { branchId_productId: { branchId, productId } },
    data: { quantity: after },
  });

  return tx.stockMovement.create({
    data: {
      type: input.type,
      branchId,
      productId,
      quantity: delta,
      balance: after,
      unitCost: input.unitCost ?? null,
      reason: input.reason ?? null,
      note: input.note ?? null,
      userId: input.userId,
      purchaseId: input.purchaseId,
      saleId: input.saleId,
    },
  });
}
