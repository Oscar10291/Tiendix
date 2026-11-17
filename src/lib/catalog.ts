// Búsquedas del catálogo compartidas por productos, inventario y (más adelante) la caja.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Limpia lo que llega de un lector de códigos o del teclado. */
export const cleanCode = (value: string) => value.trim().replace(/\s+/g, "");

/**
 * Busca un producto por código exacto: primero código de barras, luego SKU.
 * Devuelve también cuántas unidades representa el código (p. ej. 12 si es un fardo).
 */
export async function findProductByCode(rawCode: string) {
  const code = cleanCode(rawCode);
  if (!code) return null;

  const barcode = await prisma.productBarcode.findUnique({ where: { code }, include: { product: true } });
  if (barcode) return { product: barcode.product, quantity: barcode.quantity, matchedBy: "barcode" as const };

  const product = await prisma.product.findFirst({ where: { sku: { equals: code, mode: "insensitive" } } });
  if (product) return { product, quantity: null, matchedBy: "sku" as const };

  return null;
}

/** Filtro de Prisma para buscar productos por nombre, SKU o código de barras. */
export function productSearchWhere(q: string): Prisma.ProductWhereInput {
  const text = q.trim();
  if (!text) return {};
  const code = cleanCode(text);
  return {
    OR: [
      { name: { contains: text, mode: "insensitive" } },
      { sku: { contains: code, mode: "insensitive" } },
      { barcodes: { some: { code: { startsWith: code } } } },
    ],
  };
}
