"use server";

import { Prisma, PurchaseStatus, StockMovementType, type Product } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentSession } from "@/lib/auth/session";
import { findProductByCode, productSearchWhere } from "@/lib/catalog";
import { dayStart } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import { applyStockMovement } from "@/lib/inventory/stock";
import { centsToDecimal, milliToDecimal, parseMoney, parseQuantity } from "@/lib/pos/money";
import { computePurchase } from "@/lib/purchases/calc";
import { updateAverageCost } from "@/lib/purchases/cost";

const OPEN: PurchaseStatus[] = [PurchaseStatus.DRAFT, PurchaseStatus.ORDERED];
const MAX_LINES = 200;

/** El usuario solo ve y maneja compras de sus sucursales. */
const canAccess = (session: CurrentSession, branchId: string) => session.availableBranches.some((b) => b.id === branchId);

// ─────────────────────────────────────────────
// Búsqueda de productos para la orden
// ─────────────────────────────────────────────

export type PurchaseProductOption = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  /** Costo actual del producto (se propone como costo de compra) */
  cost: string;
  /** Existencia en la sucursal activa */
  stock: string;
  minStock: string;
  /** Unidades del código escaneado (12 si era el código del fardo) */
  scannedQty?: string;
};

async function toOption(p: Product, branchId: string | null, scannedQty?: Prisma.Decimal | null): Promise<PurchaseProductOption> {
  const stock = branchId ? await prisma.stock.findUnique({ where: { branchId_productId: { branchId, productId: p.id } } }) : null;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    unit: UNIT_LABELS[p.unit].short,
    cost: p.cost.toString(),
    stock: (stock?.quantity ?? 0).toString(),
    minStock: p.minStock.toString(),
    scannedQty: scannedQty?.toString(),
  };
}

export type PurchaseLookup = { exact?: PurchaseProductOption; matches: PurchaseProductOption[]; message?: string };

/** Busca un producto por código exacto (lector) o por nombre/SKU. Solo productos que controlan existencia. */
export async function lookupPurchaseProducts(query: string): Promise<PurchaseLookup> {
  const session = await requirePermission("purchases:manage");
  const branchId = session.branch?.id ?? null;
  const text = String(query ?? "").trim().slice(0, 100);
  if (!text) return { matches: [] };

  const found = await findProductByCode(text);
  if (found) {
    const p = found.product;
    if (!p.active) return { matches: [], message: `"${p.name}" está desactivado. Actívalo en Productos para comprarlo.` };
    if (!p.trackStock) return { matches: [], message: `"${p.name}" no controla existencias (es un servicio).` };
    return { exact: await toOption(p, branchId, found.quantity), matches: [] };
  }

  const products = await prisma.product.findMany({
    where: { ...productSearchWhere(text), active: true, trackStock: true },
    orderBy: { name: "asc" },
    take: 8,
  });
  if (products.length === 1) return { exact: await toOption(products[0], branchId), matches: [] };
  return {
    matches: await Promise.all(products.map((p) => toOption(p, branchId))),
    message: products.length === 0 ? `No se encontró ningún producto con "${text}".` : undefined,
  };
}

/** Productos con stock bajo en la sucursal activa, para sugerirlos en una orden nueva. */
export async function lowStockSuggestions(): Promise<PurchaseProductOption[]> {
  const session = await requirePermission("purchases:manage");
  const branchId = session.branch?.id;
  if (!branchId) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM products p
    LEFT JOIN stock s ON s."productId" = p.id AND s."branchId" = ${branchId}
    WHERE p.active AND p."trackStock" AND p."minStock" > 0 AND COALESCE(s.quantity, 0) <= p."minStock"
    ORDER BY p.name LIMIT 50`;
  const products = await prisma.product.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: { name: "asc" } });
  return Promise.all(products.map((p) => toOption(p, branchId)));
}

// ─────────────────────────────────────────────
// Crear / editar una orden
// ─────────────────────────────────────────────

export type PurchaseFormState = { error?: string };

const headerSchema = z.object({
  supplierId: z.string().min(1, "Elige el proveedor."),
  invoiceNumber: z.string().trim().max(40, "El número de factura es demasiado largo."),
  expectedAt: z.string().refine((v) => v === "" || dayStart(v) !== undefined, "La fecha de entrega no es válida."),
  note: z.string().trim().max(300, "La nota es demasiado larga."),
  intent: z.enum(["draft", "order"]),
});

const itemsSchema = z
  .array(z.object({ productId: z.string().min(1), quantity: z.string(), unitCost: z.string() }))
  .min(1, "Agrega al menos un producto.")
  .max(MAX_LINES, `Máximo ${MAX_LINES} productos por orden.`);

/**
 * Guarda una orden nueva (id = null) o los cambios de una que aún no se recibe.
 * "draft" la deja como borrador; "order" la marca como enviada al proveedor.
 */
export async function savePurchase(id: string | null, _prev: PurchaseFormState, formData: FormData): Promise<PurchaseFormState> {
  const session = await requirePermission("purchases:manage");

  const header = headerSchema.safeParse({
    supplierId: String(formData.get("supplierId") ?? ""),
    invoiceNumber: String(formData.get("invoiceNumber") ?? ""),
    expectedAt: String(formData.get("expectedAt") ?? ""),
    note: String(formData.get("note") ?? ""),
    intent: String(formData.get("intent") ?? "draft"),
  });
  if (!header.success) return { error: header.error.issues[0].message };
  const h = header.data;

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer los productos de la orden." };
  }
  const items = itemsSchema.safeParse(rawItems);
  if (!items.success) return { error: items.error.issues[0].message };

  // Líneas en milésimas y centavos
  const seen = new Set<string>();
  const lines: { productId: string; quantity: number; unitCost: number }[] = [];
  for (const [i, it] of items.data.entries()) {
    const quantity = parseQuantity(it.quantity);
    const unitCost = parseMoney(it.unitCost);
    if (quantity === null || quantity <= 0) return { error: `Línea ${i + 1}: la cantidad debe ser mayor que cero (máximo 3 decimales).` };
    if (unitCost === null) return { error: `Línea ${i + 1}: el costo no es válido (máximo 2 decimales).` };
    if (seen.has(it.productId)) return { error: `Línea ${i + 1}: el producto está repetido; suma las cantidades en una sola línea.` };
    seen.add(it.productId);
    lines.push({ productId: it.productId, quantity, unitCost });
  }

  const products = await prisma.product.findMany({ where: { id: { in: [...seen] } } });
  const productBy = new Map(products.map((p) => [p.id, p]));
  for (const [i, l] of lines.entries()) {
    const p = productBy.get(l.productId);
    if (!p) return { error: `Línea ${i + 1}: el producto ya no existe.` };
    if (!p.trackStock) return { error: `"${p.name}" no controla existencias y no se puede comprar.` };
  }

  // Sucursal: la activa para órdenes nuevas; la misma de siempre al editar
  const existing = id ? await prisma.purchase.findUnique({ where: { id } }) : null;
  if (id && (!existing || !canAccess(session, existing.branchId))) return { error: "No se encontró la orden." };
  if (existing && !OPEN.includes(existing.status)) return { error: "Esta orden ya fue recibida o cancelada; no se puede editar." };
  const branchId = existing?.branchId ?? session.branch?.id;
  if (!branchId) return { error: "No tienes una sucursal activa." };

  const supplier = await prisma.supplier.findUnique({ where: { id: h.supplierId } });
  if (!supplier) return { error: "El proveedor ya no existe." };
  if (!supplier.active && supplier.id !== existing?.supplierId) return { error: `El proveedor "${supplier.name}" está inactivo.` };

  const totals = computePurchase(lines);
  const total = centsToDecimal(totals.total);
  const itemsData = lines.map((l, i) => ({
    productId: l.productId,
    quantity: milliToDecimal(l.quantity),
    unitCost: centsToDecimal(l.unitCost),
    total: centsToDecimal(totals.lines[i]),
  }));
  const status = h.intent === "order" ? PurchaseStatus.ORDERED : (existing?.status ?? PurchaseStatus.DRAFT);
  const data = {
    supplierId: supplier.id,
    invoiceNumber: h.invoiceNumber || null,
    expectedAt: h.expectedAt ? dayStart(h.expectedAt)! : null,
    note: h.note || null,
    subtotal: total,
    tax: "0",
    total,
    status,
    ...(status === PurchaseStatus.ORDERED && !existing?.orderedAt ? { orderedAt: new Date() } : {}),
  };

  let purchaseId: string;
  if (existing) {
    const ok = await prisma.$transaction(async (tx) => {
      // Cambio condicionado: si alguien la recibió o canceló mientras tanto, no se toca
      const changed = await tx.purchase.updateMany({ where: { id: existing.id, status: { in: OPEN } }, data });
      if (changed.count === 0) return false;
      await tx.purchaseItem.deleteMany({ where: { purchaseId: existing.id } });
      await tx.purchaseItem.createMany({ data: itemsData.map((it) => ({ ...it, purchaseId: existing.id })) });
      return true;
    });
    if (!ok) return { error: "Esta orden ya fue recibida o cancelada; no se puede editar." };
    purchaseId = existing.id;
  } else {
    const created = await prisma.purchase.create({
      data: { ...data, branchId, userId: session.user.id, items: { create: itemsData } },
    });
    purchaseId = created.id;
  }

  revalidatePath("/compras");
  redirect(`/compras/${purchaseId}?ok=${existing ? "editada" : h.intent === "order" ? "enviada" : "creada"}`);
}

// ─────────────────────────────────────────────
// Cambios de estado
// ─────────────────────────────────────────────

/** Borrador → Enviada (ya se pidió al proveedor). */
export async function markPurchaseOrdered(id: string) {
  const session = await requirePermission("purchases:manage");
  const p = await prisma.purchase.findUnique({ where: { id } });
  if (!p || !canAccess(session, p.branchId)) return;
  await prisma.purchase.updateMany({ where: { id, status: PurchaseStatus.DRAFT }, data: { status: PurchaseStatus.ORDERED, orderedAt: new Date() } });
  revalidatePath(`/compras/${id}`);
  revalidatePath("/compras");
}

export type ActionState = { error?: string };

/**
 * Recibe TODA la mercadería de la orden:
 * - suma la existencia de cada producto en la sucursal de la orden y lo registra en el kárdex;
 * - recalcula el costo promedio ponderado de cada producto;
 * - marca la orden como recibida.
 * Todo en una sola transacción: o entra todo o no entra nada.
 */
export async function receivePurchase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("purchases:manage");
  const id = String(formData.get("purchaseId") ?? "");
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim().slice(0, 40);

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, supplier: { select: { name: true } } },
  });
  if (!purchase || !canAccess(session, purchase.branchId)) return { error: "No se encontró la orden." };
  if (!OPEN.includes(purchase.status)) return { error: "Esta orden ya fue recibida o cancelada." };
  if (purchase.items.length === 0) return { error: "La orden no tiene productos." };

  const done = await prisma.$transaction(async (tx) => {
    // Cambio condicionado: si dos personas reciben a la vez, solo una gana
    const changed = await tx.purchase.updateMany({
      where: { id: purchase.id, status: { in: OPEN } },
      data: {
        status: PurchaseStatus.RECEIVED,
        receivedAt: new Date(),
        receivedById: session.user.id,
        ...(invoiceNumber ? { invoiceNumber } : {}),
      },
    });
    if (changed.count === 0) return false;

    // Orden fijo por producto para que dos recepciones simultáneas no se bloqueen entre sí
    const items = [...purchase.items].sort((a, b) => a.productId.localeCompare(b.productId));
    for (const it of items) {
      if (!it.product.trackStock) continue;
      await updateAverageCost(tx, it.productId, it.quantity, it.unitCost);
      await applyStockMovement(tx, {
        type: StockMovementType.PURCHASE,
        branchId: purchase.branchId,
        productId: it.productId,
        userId: session.user.id,
        delta: it.quantity,
        unitCost: it.unitCost,
        note: `Compra #${purchase.number} · ${purchase.supplier.name}${invoiceNumber || purchase.invoiceNumber ? ` · factura ${invoiceNumber || purchase.invoiceNumber}` : ""}`,
        purchaseId: purchase.id,
      });
    }
    return true;
  });
  if (!done) return { error: "Esta orden ya fue recibida o cancelada." };

  revalidatePath("/compras");
  revalidatePath("/inventario");
  revalidatePath("/productos");
  redirect(`/compras/${purchase.id}?ok=recibida`);
}

/** Cancela una orden que aún no se recibe. No toca el inventario. */
export async function cancelPurchase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("purchases:manage");
  const id = String(formData.get("purchaseId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  if (reason.length < 3) return { error: "Escribe el motivo de la cancelación." };

  const p = await prisma.purchase.findUnique({ where: { id } });
  if (!p || !canAccess(session, p.branchId)) return { error: "No se encontró la orden." };

  const changed = await prisma.purchase.updateMany({
    where: { id, status: { in: OPEN } },
    data: { status: PurchaseStatus.CANCELLED, cancelledAt: new Date(), cancelledById: session.user.id, cancelReason: reason },
  });
  if (changed.count === 0) return { error: "Esta orden ya fue recibida o cancelada." };

  revalidatePath("/compras");
  redirect(`/compras/${id}?ok=cancelada`);
}
