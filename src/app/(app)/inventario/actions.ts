"use server";

import { Prisma, StockMovementType, type Product } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { findProductByCode, productSearchWhere } from "@/lib/catalog";
import { decimalSchema, normalizeDecimal } from "@/lib/decimal";
import { qty } from "@/lib/format";
import { REASONS, UNIT_LABELS, type ManualKind } from "@/lib/inventory/reasons";
import { applyStockMovement, StockError } from "@/lib/inventory/stock";

export type ProductOption = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  minStock: string;
  cost: string;
  stock: string;
  /** Unidades del código escaneado (12 si era el código del fardo) */
  scannedQty?: string;
};

async function toOption(p: Product, branchId: string, scannedQty?: Prisma.Decimal | null): Promise<ProductOption> {
  const stock = await prisma.stock.findUnique({ where: { branchId_productId: { branchId, productId: p.id } } });
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    unit: UNIT_LABELS[p.unit].short,
    minStock: p.minStock.toString(),
    cost: p.cost.toString(),
    stock: (stock?.quantity ?? new Prisma.Decimal(0)).toString(),
    scannedQty: scannedQty?.toString(),
  };
}

export type LookupResult = { exact?: ProductOption; matches: ProductOption[]; message?: string };

/**
 * Busca un producto para moverlo. Primero por código exacto (lo que manda el lector),
 * si no, por nombre/SKU/código parcial.
 */
export async function lookupProducts(query: string): Promise<LookupResult> {
  const session = await requirePermission("inventory:manage");
  const branch = session.branch;
  if (!branch) return { matches: [], message: "No tienes una sucursal activa." };
  const text = String(query ?? "").trim().slice(0, 100);
  if (!text) return { matches: [] };

  const found = await findProductByCode(text);
  if (found) {
    const p = found.product;
    if (!p.active) return { matches: [], message: `"${p.name}" está desactivado. Actívalo en Productos para moverlo.` };
    if (!p.trackStock) return { matches: [], message: `"${p.name}" no controla existencias (es un servicio).` };
    return { exact: await toOption(p, branch.id, found.quantity), matches: [] };
  }

  const products = await prisma.product.findMany({
    where: { ...productSearchWhere(text), active: true, trackStock: true },
    orderBy: { name: "asc" },
    take: 8,
  });
  if (products.length === 1) return { exact: await toOption(products[0], branch.id), matches: [] };
  return {
    matches: await Promise.all(products.map((p) => toOption(p, branch.id))),
    message: products.length === 0 ? `No se encontró ningún producto con "${text}".` : undefined,
  };
}

/** Datos de un producto por id (cuando se llega desde "Mover" en una lista). */
export async function getProductOption(productId: string): Promise<ProductOption | null> {
  const session = await requirePermission("inventory:manage");
  if (!session.branch) return null;
  const p = await prisma.product.findUnique({ where: { id: productId } });
  if (!p || !p.active || !p.trackStock) return null;
  return toOption(p, session.branch.id);
}

export type MovementState = {
  error?: string;
  /** Resultado del último movimiento guardado */
  saved?: { id: string; productName: string; text: string; balance: string; unit: string };
};

const schema = z
  .object({
    productId: z.string().min(1, "Elige un producto."),
    kind: z.enum(["IN", "OUT", "ADJUST"], "Elige el tipo de movimiento."),
    quantity: decimalSchema({ decimals: 3, label: "la cantidad" }),
    reason: z.string().min(1, "Elige el motivo."),
    unitCost: decimalSchema({ decimals: 2, label: "el costo" }).nullable(),
    note: z.string().trim().max(200, "La nota es demasiado larga."),
  })
  .refine((d) => REASONS[d.kind].some((r) => r.value === d.reason), { message: "El motivo no corresponde al tipo de movimiento." })
  .refine((d) => d.reason !== "OTRO" || d.note.length > 0, { message: 'Con el motivo "Otro" escribe una nota explicando.' })
  .refine((d) => d.kind === "ADJUST" || Number(d.quantity) > 0, { message: "La cantidad debe ser mayor que cero." });

const TYPE_BY_KIND: Record<ManualKind, StockMovementType> = {
  IN: StockMovementType.MANUAL_IN,
  OUT: StockMovementType.MANUAL_OUT,
  ADJUST: StockMovementType.ADJUSTMENT,
};

/** Registra una entrada, salida o ajuste manual en la sucursal activa. */
export async function registerMovement(_prev: MovementState, formData: FormData): Promise<MovementState> {
  const session = await requirePermission("inventory:manage");
  const branch = session.branch;
  if (!branch) return { error: "No tienes una sucursal activa." };

  const parsed = schema.safeParse({
    productId: String(formData.get("productId") ?? ""),
    kind: String(formData.get("kind") ?? ""),
    quantity: normalizeDecimal(formData.get("quantity")) ?? "",
    reason: String(formData.get("reason") ?? ""),
    unitCost: formData.get("kind") === "IN" ? normalizeDecimal(formData.get("unitCost")) : null,
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: d.productId } });
  if (!product || !product.active) return { error: "El producto no existe o está desactivado." };
  if (!product.trackStock) return { error: "Este producto no controla existencias." };

  const amount = new Prisma.Decimal(d.quantity);
  const unitCost = d.unitCost ? new Prisma.Decimal(d.unitCost) : d.kind === "ADJUST" ? null : product.cost;

  try {
    const movement = await prisma.$transaction(async (tx) => {
      const m = await applyStockMovement(tx, {
        type: TYPE_BY_KIND[d.kind],
        branchId: branch.id,
        productId: product.id,
        userId: session.user.id,
        ...(d.kind === "ADJUST" ? { setTo: amount } : { delta: d.kind === "IN" ? amount : amount.negated() }),
        unitCost,
        reason: d.reason,
        note: d.note || null,
      });
      // Una compra directa con costo nuevo actualiza el "último costo" del producto
      if (d.kind === "IN" && d.reason === "COMPRA_DIRECTA" && d.unitCost && !product.cost.equals(d.unitCost)) {
        await tx.product.update({ where: { id: product.id }, data: { cost: d.unitCost } });
      }
      return m;
    });

    revalidatePath("/inventario");
    revalidatePath(`/productos/${product.id}`);
    const unit = UNIT_LABELS[product.unit].short;
    const sign = movement.quantity.isNegative() ? "−" : "+";
    return {
      saved: {
        id: movement.id,
        productName: product.name,
        text: `${sign}${qty(movement.quantity.abs())} ${unit}`,
        balance: qty(movement.balance ?? 0),
        unit,
      },
    };
  } catch (e) {
    if (e instanceof StockError) return { error: e.message };
    throw e;
  }
}
