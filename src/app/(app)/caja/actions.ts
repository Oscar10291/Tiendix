"use server";

import { Prisma, PaymentMethod, StockMovementType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { findProductByCode, productSearchWhere } from "@/lib/catalog";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import { applyStockMovement, StockError } from "@/lib/inventory/stock";
import { canAccessCashSession, cashSessionTotals, getOpenCashSession } from "@/lib/pos/cash";
import { centsToDecimal, computeSale, countDenominations, DENOMINATIONS, milliToDecimal, parseMoney, parseQuantity } from "@/lib/pos/money";

// ─────────────────────────────────────────────
// Apertura de caja
// ─────────────────────────────────────────────

export type OpenState = { error?: string };

/** Abre el turno de caja del usuario en la sucursal activa, con un fondo inicial. */
export async function openCashSession(_prev: OpenState, formData: FormData): Promise<OpenState> {
  const session = await requirePermission("pos:use");
  if (!session.branch) return { error: "No tienes una sucursal activa." };

  const opening = parseMoney(String(formData.get("openingAmount") ?? ""));
  if (opening === null) return { error: "Escribe el fondo inicial (puede ser 0)." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  try {
    await prisma.cashSession.create({
      data: {
        branchId: session.branch.id,
        userId: session.user.id,
        openingAmount: centsToDecimal(opening),
        openingNote: note,
      },
    });
  } catch (e) {
    // Índice único parcial: ya tiene una caja abierta
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Ya tienes una caja abierta. Ciérrala antes de abrir otra." };
    }
    throw e;
  }
  revalidatePath("/caja");
  redirect("/caja");
}

// ─────────────────────────────────────────────
// Búsqueda de productos para el carrito
// ─────────────────────────────────────────────

export type PosProduct = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  /** Precio con impuesto, p. ej. "7.00" */
  price: string;
  taxRate: string;
  /** Existencia en la sucursal; null si el producto no controla stock (servicio) */
  stock: string | null;
  /** Unidades del código escaneado (12 si era el código del fardo) */
  scannedQty?: string;
};

export type PosLookupResult = { exact?: PosProduct; matches: PosProduct[]; message?: string };

async function toPosProducts(
  products: { id: string; name: string; sku: string; unit: string; price: Prisma.Decimal; taxRate: Prisma.Decimal; trackStock: boolean }[],
  branchId: string,
) {
  const stock = await prisma.stock.findMany({ where: { branchId, productId: { in: products.map((p) => p.id) } } });
  const byId = new Map(stock.map((s) => [s.productId, s.quantity.toString()]));
  return products.map<PosProduct>((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    unit: UNIT_LABELS[p.unit].short,
    price: p.price.toFixed(2),
    taxRate: p.taxRate.toString(),
    stock: p.trackStock ? (byId.get(p.id) ?? "0") : null,
  }));
}

/** Busca por código exacto (lector) y si no, por nombre / SKU / código parcial. */
export async function posLookup(query: string): Promise<PosLookupResult> {
  const session = await requirePermission("pos:use");
  const branch = session.branch;
  if (!branch) return { matches: [], message: "No tienes una sucursal activa." };
  const text = String(query ?? "").trim().slice(0, 100);
  if (!text) return { matches: [] };

  const found = await findProductByCode(text);
  if (found) {
    if (!found.product.active) return { matches: [], message: `"${found.product.name}" está desactivado y no se puede vender.` };
    const [p] = await toPosProducts([found.product], branch.id);
    return { exact: { ...p, scannedQty: found.quantity?.toString() }, matches: [] };
  }

  const products = await prisma.product.findMany({
    where: { ...productSearchWhere(text), active: true },
    orderBy: { name: "asc" },
    take: 10,
  });
  const options = await toPosProducts(products, branch.id);
  if (options.length === 1) return { exact: options[0], matches: [] };
  return { matches: options, message: options.length === 0 ? `No se encontró ningún producto con "${text}".` : undefined };
}

// ─────────────────────────────────────────────
// Cobro
// ─────────────────────────────────────────────

export type ChargeInput = {
  /** Id único generado en el navegador para esta venta (evita cobrar dos veces) */
  clientId: string;
  items: { productId: string; quantity: string; discount: string }[];
  /** Descuento a toda la venta, en quetzales */
  saleDiscount: string;
  /** Efectivo que entregó el cliente */
  tendered: string;
};

export type ChargeResult =
  | { ok: true; saleId: string; number: number; total: string; tendered: string; change: string }
  | { ok: false; error: string };

/**
 * Cobra la venta en efectivo. Todo pasa en una sola transacción:
 * crea la venta, sus líneas y el pago, y descuenta el stock (kárdex tipo "Venta").
 * Si algún producto no alcanza, no se guarda nada.
 * Los precios se toman de la base de datos, nunca del navegador.
 */
export async function chargeSale(input: ChargeInput): Promise<ChargeResult> {
  const session = await requirePermission("pos:use");
  const fail = (error: string): ChargeResult => ({ ok: false, error });

  const cash = await getOpenCashSession(session.user.id);
  if (!cash) return fail("No tienes una caja abierta. Abre la caja para cobrar.");
  if (session.branch?.id !== cash.branchId) return fail(`Tu caja está abierta en ${cash.branch.name}. Cambia a esa sucursal para cobrar.`);

  const clientId = String(input?.clientId ?? "").slice(0, 64);
  if (!/^[\w-]{8,64}$/.test(clientId)) return fail("Venta inválida, recarga la página.");

  // ¿Ya se cobró esta misma venta? (doble clic o reintento por mala conexión)
  const already = await prisma.sale.findUnique({ where: { clientId }, include: { payments: true } });
  if (already) {
    if (already.userId !== session.user.id) return fail("Venta inválida, recarga la página.");
    const pay = already.payments[0];
    return {
      ok: true,
      saleId: already.id,
      number: already.number,
      total: already.total.toFixed(2),
      tendered: (pay?.tendered ?? already.total).toFixed(2),
      change: (pay?.change ?? 0).toFixed(2),
    };
  }

  const rawItems = Array.isArray(input?.items) ? input.items : [];
  if (rawItems.length === 0) return fail("El carrito está vacío.");
  if (rawItems.length > 200) return fail("Demasiadas líneas en una sola venta.");

  const items: { productId: string; quantity: number; discount: number }[] = [];
  for (const [i, it] of rawItems.entries()) {
    const quantity = parseQuantity(it?.quantity);
    const discount = parseMoney(it?.discount || "0");
    if (quantity === null || quantity <= 0 || quantity > 99_999_000) return fail(`Revisa la cantidad de la línea ${i + 1}.`);
    if (discount === null) return fail(`Revisa el descuento de la línea ${i + 1}.`);
    items.push({ productId: String(it.productId), quantity, discount });
  }
  const saleDiscount = parseMoney(input?.saleDiscount || "0");
  if (saleDiscount === null) return fail("Revisa el descuento de la venta.");
  const tendered = parseMoney(input?.tendered);
  if (tendered === null) return fail("Escribe cuánto entregó el cliente.");

  const products = await prisma.product.findMany({ where: { id: { in: [...new Set(items.map((i) => i.productId))] } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p) return fail("Un producto del carrito ya no existe. Quítalo y vuelve a agregarlo.");
    if (!p.active) return fail(`"${p.name}" fue desactivado y no se puede vender.`);
  }

  const totals = computeSale(
    items.map((it) => {
      const p = byId.get(it.productId)!;
      return { quantity: it.quantity, unitPrice: parseMoney(p.price.toFixed(2))!, discount: it.discount, taxRate: Number(p.taxRate) };
    }),
    saleDiscount,
  );
  if (totals.error) return fail(totals.error);
  if (tendered < totals.total) return fail(`El efectivo recibido no alcanza: faltan ${centsToDecimal(totals.total - tendered)}.`);
  const change = tendered - totals.total;

  // Cantidad total a descontar por producto (el mismo producto puede venir en varias líneas)
  const outByProduct = new Map<string, number>();
  for (const it of items) outByProduct.set(it.productId, (outByProduct.get(it.productId) ?? 0) + it.quantity);

  try {
    const sale = await prisma.$transaction(async (tx) => {
      // Bloquea el turno: si alguien lo está cerrando en este instante, espera y luego verifica
      const [cs] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM cash_sessions WHERE id = ${cash.id} FOR UPDATE`;
      if (cs?.status !== "OPEN") throw new StockError("La caja se cerró. Abre la caja de nuevo para cobrar.");

      const created = await tx.sale.create({
        data: {
          clientId,
          branchId: cash.branchId,
          userId: session.user.id,
          cashSessionId: cash.id,
          subtotal: centsToDecimal(totals.subtotal),
          discount: centsToDecimal(totals.discount),
          tax: centsToDecimal(totals.tax),
          total: centsToDecimal(totals.total),
          items: {
            create: items.map((it, i) => {
              const p = byId.get(it.productId)!;
              return {
                productId: p.id,
                quantity: milliToDecimal(it.quantity),
                unitPrice: p.price,
                discount: centsToDecimal(totals.lines[i].discount),
                taxRate: p.taxRate,
                total: centsToDecimal(totals.lines[i].total),
                unitCost: p.cost,
              };
            }),
          },
          payments: {
            create: {
              method: PaymentMethod.CASH,
              amount: centsToDecimal(totals.total),
              tendered: centsToDecimal(tendered),
              change: centsToDecimal(change),
            },
          },
        },
      });

      // Descuenta existencias en orden fijo (por id) para que dos cajas no se bloqueen entre sí
      for (const productId of [...outByProduct.keys()].sort()) {
        const p = byId.get(productId)!;
        if (!p.trackStock) continue;
        try {
          await applyStockMovement(tx, {
            type: StockMovementType.SALE,
            branchId: cash.branchId,
            productId,
            userId: session.user.id,
            delta: new Prisma.Decimal(milliToDecimal(outByProduct.get(productId)!)).negated(),
            unitCost: p.cost,
            note: `Venta #${created.number}`,
            saleId: created.id,
          });
        } catch (e) {
          if (e instanceof StockError) throw new StockError(`${p.name}: ${e.message}`);
          throw e;
        }
      }
      return created;
    });

    revalidatePath("/inventario");
    revalidatePath("/ventas");
    return {
      ok: true,
      saleId: sale.id,
      number: sale.number,
      total: centsToDecimal(totals.total),
      tendered: centsToDecimal(tendered),
      change: centsToDecimal(change),
    };
  } catch (e) {
    if (e instanceof StockError) return fail(e.message);
    // Dos peticiones con el mismo clientId al mismo tiempo: la segunda devuelve la primera
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return chargeSale(input);
    throw e;
  }
}

// ─────────────────────────────────────────────
// Cierre de caja (arqueo)
// ─────────────────────────────────────────────

export type CloseState = { error?: string };

/**
 * Cierra el turno: guarda el conteo del efectivo (por billete y moneda) y la diferencia
 * contra lo esperado. Lo puede cerrar el propio cajero o un gerente/administrador.
 */
export async function closeCashSession(_prev: CloseState, formData: FormData): Promise<CloseState> {
  const session = await requirePermission("pos:use");
  const id = String(formData.get("cashSessionId") ?? "");
  const cs = await prisma.cashSession.findUnique({ where: { id } });
  if (!cs || !canAccessCashSession(session, cs)) return { error: "No se encontró la caja." };
  if (cs.status !== "OPEN") return { error: "Esta caja ya está cerrada." };

  const counts: Record<string, number> = {};
  for (const d of DENOMINATIONS) {
    const raw = String(formData.get(`d_${d.value}`) ?? "").trim();
    if (raw === "") continue;
    if (!/^\d{1,6}$/.test(raw)) return { error: `Revisa la cantidad de ${d.label}: debe ser un número entero.` };
    const n = Number(raw);
    if (n > 0) counts[d.value] = n;
  }
  const counted = countDenominations(counts);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;

  const closed = await prisma.$transaction(async (tx) => {
    // Bloquea el turno para que no entre una venta mientras se cierra
    const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM cash_sessions WHERE id = ${cs.id} FOR UPDATE`;
    if (row?.status !== "OPEN") return false;
    const t = await cashSessionTotals(tx, cs.id, cs.openingAmount);
    const countedDec = new Prisma.Decimal(centsToDecimal(counted));
    await tx.cashSession.update({
      where: { id: cs.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        salesCount: t.salesCount,
        cashSales: t.cashSales,
        expectedCash: t.expectedCash,
        countedCash: countedDec,
        difference: countedDec.minus(t.expectedCash),
        denominations: counts,
        closingNote: note,
      },
    });
    return true;
  });
  if (!closed) return { error: "Esta caja ya está cerrada." };

  revalidatePath("/caja");
  redirect(`/caja/cortes/${cs.id}?cerrada=1`);
}
