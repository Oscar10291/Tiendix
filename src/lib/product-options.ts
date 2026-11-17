import type { Product, ProductBarcode } from "@prisma/client";
import type { ProductFormValues } from "@/app/(app)/productos/actions";
import { getCategoryTree } from "@/lib/categories";

/** Categorías que se pueden elegir en el formulario (activas + la actual del producto). */
export async function categoryOptions(currentId?: string | null) {
  const tree = await getCategoryTree();
  return tree.filter((c) => c.active || c.id === currentId).map((c) => ({ id: c.id, path: c.path }));
}

/** Convierte un producto de la base en los valores del formulario. */
export function toFormValues(p: Product & { barcodes: ProductBarcode[] }): ProductFormValues {
  return {
    sku: p.sku,
    name: p.name,
    description: p.description ?? "",
    categoryId: p.categoryId ?? "",
    unit: p.unit,
    cost: p.cost.toString(),
    price: p.price.toString(),
    taxRate: p.taxRate.toString(),
    minStock: p.minStock.toString(),
    trackStock: p.trackStock,
    active: p.active,
    barcodes: p.barcodes.map((b) => ({ code: b.code, quantity: b.quantity.toString() })),
    initialStock: "",
  };
}
