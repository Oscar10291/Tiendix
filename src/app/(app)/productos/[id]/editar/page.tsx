import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { categoryOptions, toFormValues } from "@/lib/product-options";
import { saveProduct } from "../../actions";
import { ProductForm } from "../../product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("products:manage");
  const { id } = await params;

  const product = await prisma.product.findUnique({ where: { id }, include: { barcodes: { orderBy: { code: "asc" } } } });
  if (!product) notFound();

  return (
    <main>
      <h1 className="text-2xl font-bold">Editar producto</h1>
      <p className="mt-1 text-sm text-neutral-500">{product.name}</p>
      <ProductForm
        action={saveProduct.bind(null, id)}
        categories={await categoryOptions(product.categoryId)}
        product={toFormValues(product)}
        cancelHref={`/productos/${id}`}
      />
    </main>
  );
}
