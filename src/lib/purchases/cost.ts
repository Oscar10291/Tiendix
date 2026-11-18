// Solo para el servidor: usa Prisma.
import { Prisma } from "@prisma/client";
import { centsToDecimal } from "@/lib/pos/money";
import { decimalToCents, decimalToMilli, weightedAverageCost } from "./calc";

/**
 * Recalcula el costo promedio ponderado de un producto al entrar mercadería comprada.
 * Debe llamarse dentro de la misma transacción y ANTES de `applyStockMovement`,
 * porque usa la existencia total (todas las sucursales) previa a la entrada.
 * Devuelve el costo anterior y el nuevo (texto decimal) para mostrarlos.
 */
export async function updateAverageCost(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: Prisma.Decimal,
  unitCost: Prisma.Decimal,
) {
  // Bloquea el producto: dos recepciones simultáneas del mismo producto no se pisan
  const [row] = await tx.$queryRaw<{ cost: Prisma.Decimal }[]>`SELECT cost FROM products WHERE id = ${productId} FOR UPDATE`;
  const stock = await tx.stock.aggregate({ where: { productId }, _sum: { quantity: true } });

  const before = decimalToCents(row.cost);
  const after = weightedAverageCost({
    stock: decimalToMilli(stock._sum.quantity ?? 0),
    currentCost: before,
    quantity: decimalToMilli(quantity),
    unitCost: decimalToCents(unitCost),
  });
  if (after !== before) await tx.product.update({ where: { id: productId }, data: { cost: centsToDecimal(after) } });
  return { before: centsToDecimal(before), after: centsToDecimal(after) };
}
