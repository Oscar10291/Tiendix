import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { saveSupplier } from "../actions";
import { SupplierForm } from "../supplier-form";

export const metadata = { title: "Nuevo proveedor · Tiendix" };

export default async function NewSupplierPage() {
  await requirePermission("purchases:manage");
  return (
    <main>
      <p className="text-sm">
        <Link href="/compras/proveedores" className="text-blue-600 hover:underline">
          ← Proveedores
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">Nuevo proveedor</h1>
      <SupplierForm action={saveSupplier.bind(null, null)} cancelHref="/compras/proveedores" />
    </main>
  );
}
