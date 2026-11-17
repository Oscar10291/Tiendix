import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { cleanCode } from "@/lib/catalog";
import { categoryOptions } from "@/lib/product-options";
import { saveProduct } from "../actions";
import { ProductForm } from "../product-form";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { user, branch } = await requirePermission("products:manage");
  const { codigo } = await searchParams;
  const code = cleanCode(codigo ?? "").slice(0, 64);

  return (
    <main>
      <h1 className="text-2xl font-bold">Nuevo producto</h1>
      <ProductForm
        action={saveProduct.bind(null, null)}
        categories={await categoryOptions()}
        defaults={code ? { barcodes: [{ code, quantity: "1" }] } : undefined}
        cancelHref="/productos"
        initialStockBranch={can(user.role, "inventory:manage") ? (branch?.name ?? null) : null}
      />
    </main>
  );
}
