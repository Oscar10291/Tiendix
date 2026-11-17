"use server";

import { Prisma, StockMovementType, UnitOfMeasure } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { cleanCode } from "@/lib/catalog";
import { decimalSchema, normalizeDecimal } from "@/lib/decimal";
import { applyStockMovement } from "@/lib/inventory/stock";

export type BarcodeValue = { code: string; quantity: string };

export type ProductFormValues = {
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  unit: UnitOfMeasure;
  cost: string;
  price: string;
  taxRate: string;
  minStock: string;
  trackStock: boolean;
  active: boolean;
  barcodes: BarcodeValue[];
  initialStock: string;
};

export type ProductFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: ProductFormValues;
};

const schema = z.object({
  sku: z.string().max(40, "Máximo 40 caracteres.").regex(/^[\w.\-/]*$/, "Solo letras, números, guion, punto o diagonal (sin espacios)."),
  name: z.string().trim().min(1, "Escribe el nombre.").max(120, "Nombre demasiado largo."),
  description: z.string().trim().max(500, "Descripción demasiado larga."),
  categoryId: z.string(),
  unit: z.enum(UnitOfMeasure, "Elige una unidad."),
  cost: decimalSchema({ decimals: 2, label: "el costo" }),
  price: decimalSchema({ decimals: 2, label: "el precio" }),
  taxRate: decimalSchema({ decimals: 2, max: 100, label: "el impuesto" }),
  minStock: decimalSchema({ decimals: 3, label: "el mínimo" }),
  trackStock: z.boolean(),
  active: z.boolean(),
  initialStock: decimalSchema({ decimals: 3, label: "la existencia inicial" }).or(z.literal("")),
});

function readForm(formData: FormData, isEdit: boolean): ProductFormValues {
  const codes = formData.getAll("barcodeCode").map((v) => cleanCode(String(v)));
  const qtys = formData.getAll("barcodeQty").map((v) => normalizeDecimal(v) ?? "1");
  const unit = String(formData.get("unit") ?? "");
  return {
    sku: cleanCode(String(formData.get("sku") ?? "")).toUpperCase(),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    unit: (Object.values(UnitOfMeasure) as string[]).includes(unit) ? (unit as UnitOfMeasure) : UnitOfMeasure.UNIT,
    cost: normalizeDecimal(formData.get("cost")) ?? "0",
    price: normalizeDecimal(formData.get("price")) ?? "",
    taxRate: normalizeDecimal(formData.get("taxRate")) ?? "0",
    minStock: normalizeDecimal(formData.get("minStock")) ?? "0",
    trackStock: formData.get("trackStock") === "on",
    active: isEdit ? formData.get("active") === "on" : true,
    barcodes: codes.map((code, i) => ({ code, quantity: qtys[i] ?? "1" })).filter((b) => b.code !== ""),
    initialStock: isEdit ? "" : (normalizeDecimal(formData.get("initialStock")) ?? ""),
  };
}

/** SKU automático (P000001, P000002…) cuando no se escribe uno. */
async function nextSku() {
  let n = (await prisma.product.count()) + 1;
  for (;;) {
    const sku = `P${String(n).padStart(6, "0")}`;
    if (!(await prisma.product.findUnique({ where: { sku } }))) return sku;
    n++;
  }
}

/** Crea (id = null) o edita un producto con sus códigos de barras. */
export async function saveProduct(id: string | null, _prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const session = await requirePermission("products:manage");

  const values = readForm(formData, Boolean(id));
  const fail = (error: string, fieldErrors?: Record<string, string>): ProductFormState => ({ error, fieldErrors, values });

  const parsed = schema.safeParse(values);
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  }

  // Códigos de barras: sin repetidos y con cantidad válida
  const seen = new Set<string>();
  for (const b of values.barcodes) {
    if (b.code.length > 64) fieldErrors.barcodes = `El código ${b.code.slice(0, 20)}… es demasiado largo.`;
    else if (seen.has(b.code)) fieldErrors.barcodes = `El código ${b.code} está repetido.`;
    else if (!/^\d+(\.\d{1,3})?$/.test(b.quantity) || Number(b.quantity) <= 0) {
      fieldErrors.barcodes = `La cantidad del código ${b.code} debe ser mayor que cero.`;
    }
    seen.add(b.code);
  }
  if (Object.keys(fieldErrors).length > 0 || !parsed.success) return fail("Revisa los campos marcados.", fieldErrors);
  const data = parsed.data;

  // Que ningún código pertenezca ya a otro producto
  if (values.barcodes.length > 0) {
    const taken = await prisma.productBarcode.findFirst({
      where: { code: { in: values.barcodes.map((b) => b.code) }, ...(id ? { productId: { not: id } } : {}) },
      include: { product: { select: { name: true } } },
    });
    if (taken) return fail("Revisa los campos marcados.", { barcodes: `El código ${taken.code} ya es de "${taken.product.name}".` });
  }

  if (data.categoryId && !(await prisma.category.findUnique({ where: { id: data.categoryId } }))) {
    return fail("La categoría elegida ya no existe.");
  }

  // Existencia inicial (solo al crear): necesita permiso de inventario y una sucursal activa
  const initial = data.initialStock ? new Prisma.Decimal(data.initialStock) : null;
  if (initial && !initial.isZero()) {
    if (!data.trackStock) return fail("Revisa los campos marcados.", { initialStock: "Este producto no controla existencias." });
    if (!can(session.user.role, "inventory:manage")) return fail("Tu rol no puede registrar existencias.");
    if (!session.branch) return fail("Elige una sucursal arriba para registrar la existencia inicial.");
  }

  const fields = {
    name: data.name,
    description: data.description || null,
    categoryId: data.categoryId || null,
    unit: data.unit,
    cost: data.cost,
    price: data.price,
    taxRate: data.taxRate,
    minStock: data.minStock,
    trackStock: data.trackStock,
    active: data.active,
  };
  const barcodes = values.barcodes.map((b) => ({ code: b.code, quantity: b.quantity }));

  let productId = id;
  try {
    const sku = data.sku || (id ? null : await nextSku());
    if (id && !sku) return fail("Revisa los campos marcados.", { sku: "El SKU no puede quedar vacío." });

    productId = await prisma.$transaction(async (tx) => {
      if (id) {
        await tx.product.update({ where: { id }, data: { ...fields, sku: sku! } });
        await tx.productBarcode.deleteMany({ where: { productId: id } });
        if (barcodes.length) await tx.productBarcode.createMany({ data: barcodes.map((b) => ({ ...b, productId: id })) });
        return id;
      }
      const product = await tx.product.create({ data: { ...fields, sku: sku!, barcodes: { create: barcodes } } });
      if (initial && !initial.isZero() && session.branch) {
        await applyStockMovement(tx, {
          type: StockMovementType.MANUAL_IN,
          branchId: session.branch.id,
          productId: product.id,
          userId: session.user.id,
          delta: initial,
          unitCost: new Prisma.Decimal(data.cost),
          reason: "INVENTARIO_INICIAL",
        });
      }
      return product.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = String(e.meta?.target ?? "");
      if (target.includes("sku")) return fail("Revisa los campos marcados.", { sku: "Ya existe un producto con ese SKU." });
      return fail("Revisa los campos marcados.", { barcodes: "Alguno de los códigos ya pertenece a otro producto." });
    }
    throw e;
  }

  revalidatePath("/productos");
  revalidatePath("/inventario");
  redirect(`/productos/${productId}?ok=${id ? "editado" : "creado"}`);
}

/** Activa o desactiva un producto (no se borra para no perder su historial). */
export async function setProductActive(id: string, active: boolean) {
  await requirePermission("products:manage");
  await prisma.product.update({ where: { id }, data: { active } });
  revalidatePath("/productos");
  revalidatePath(`/productos/${id}`);
  revalidatePath("/inventario");
}
