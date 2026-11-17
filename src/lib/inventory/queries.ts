// Consultas de existencias por sucursal (solo servidor).
import { Prisma, type UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanCode } from "@/lib/catalog";

export type StockFilter = "todos" | "bajo" | "sin";

export type StockRow = {
  id: string;
  name: string;
  sku: string;
  unit: UnitOfMeasure;
  minStock: Prisma.Decimal;
  cost: Prisma.Decimal;
  quantity: Prisma.Decimal;
  category: string | null;
  barcode: string | null;
};

// "Bajo" incluye también los que están en cero o negativo
const LOW = Prisma.sql`(COALESCE(s.quantity, 0) <= 0 OR (p."minStock" > 0 AND COALESCE(s.quantity, 0) <= p."minStock"))`;
const OUT = Prisma.sql`COALESCE(s.quantity, 0) <= 0`;

function whereClause(branchId: string, q: string, filter: StockFilter) {
  const parts = [Prisma.sql`p.active = true AND p."trackStock" = true`];
  const text = q.trim();
  if (text) {
    const code = cleanCode(text);
    parts.push(Prisma.sql`(
      p.name ILIKE ${`%${text}%`}
      OR p.sku ILIKE ${`%${code}%`}
      OR EXISTS (SELECT 1 FROM product_barcodes b WHERE b."productId" = p.id AND b.code LIKE ${`${code}%`})
    )`);
  }
  if (filter === "bajo") parts.push(LOW);
  if (filter === "sin") parts.push(OUT);
  return {
    from: Prisma.sql`FROM products p
      LEFT JOIN stock s ON s."productId" = p.id AND s."branchId" = ${branchId}
      LEFT JOIN categories c ON c.id = p."categoryId"`,
    where: Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`,
  };
}

/** Lista de existencias de una sucursal con búsqueda, filtro y paginación. */
export async function getStockList(branchId: string, opts: { q: string; filter: StockFilter; page: number; pageSize: number }) {
  const { from, where } = whereClause(branchId, opts.q, opts.filter);
  const [rows, [{ total }]] = await Promise.all([
    prisma.$queryRaw<StockRow[]>`
      SELECT p.id, p.name, p.sku, p.unit, p."minStock", p.cost,
             COALESCE(s.quantity, 0) AS quantity, c.name AS category,
             (SELECT b.code FROM product_barcodes b WHERE b."productId" = p.id ORDER BY b.quantity, b.code LIMIT 1) AS barcode
      ${from} ${where}
      ORDER BY p.name ASC
      LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`,
    prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${from} ${where}`,
  ]);
  return { rows, total: Number(total) };
}

/** Resumen de la sucursal: productos, cuántos en stock bajo / sin stock y valor del inventario al costo. */
export async function getStockSummary(branchId: string) {
  const [row] = await prisma.$queryRaw<{ products: bigint; low: bigint; out: bigint; value: Prisma.Decimal | null }[]>`
    SELECT COUNT(*) AS products,
           COUNT(*) FILTER (WHERE ${LOW}) AS low,
           COUNT(*) FILTER (WHERE ${OUT}) AS out,
           SUM(GREATEST(COALESCE(s.quantity, 0), 0) * p.cost) AS value
    FROM products p
    LEFT JOIN stock s ON s."productId" = p.id AND s."branchId" = ${branchId}
    WHERE p.active = true AND p."trackStock" = true`;
  return { products: Number(row.products), low: Number(row.low), out: Number(row.out), value: row.value ?? 0 };
}
