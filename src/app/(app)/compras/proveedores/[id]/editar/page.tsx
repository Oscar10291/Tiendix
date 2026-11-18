import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { saveSupplier } from "../../actions";
import { SupplierForm } from "../../supplier-form";

export const metadata = { title: "Editar proveedor · Tiendix" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("purchases:manage");
  const { id } = await params;
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) notFound();

  return (
    <main>
      <h1 className="text-2xl font-bold">Editar proveedor</h1>
      <p className="mt-1 text-sm text-neutral-500">{s.name}</p>
      <SupplierForm
        action={saveSupplier.bind(null, id)}
        cancelHref={`/compras/proveedores/${id}`}
        supplier={{
          name: s.name,
          taxId: s.taxId ?? "",
          contactName: s.contactName ?? "",
          phone: s.phone ?? "",
          email: s.email ?? "",
          address: s.address ?? "",
          notes: s.notes ?? "",
          active: s.active,
        }}
      />
    </main>
  );
}
