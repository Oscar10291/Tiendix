import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { linesFromPurchase, supplierOptions } from "@/lib/purchases/form";
import { savePurchase } from "../actions";
import { PurchaseForm } from "../purchase-form";

export const metadata = { title: "Nueva orden de compra · Tiendix" };

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ proveedor?: string; desde?: string }> }) {
  const { branch, availableBranches } = await requirePermission("purchases:manage");
  const sp = await searchParams;

  // "Repetir pedido": copia proveedor y productos de otra orden
  const source = sp.desde ? await prisma.purchase.findUnique({ where: { id: sp.desde } }) : null;
  const copy = source && availableBranches.some((b) => b.id === source.branchId) ? source : null;

  const suppliers = await supplierOptions();
  const supplierId = copy?.supplierId ?? sp.proveedor ?? "";

  return (
    <main>
      <p className="text-sm">
        <Link href="/compras" className="text-blue-600 hover:underline">
          ← Compras
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">Nueva orden de compra</h1>
      {branch ? (
        <>
          <p className="text-sm text-neutral-500">
            Se recibirá en <strong>{branch.name}</strong> (cámbiala arriba a la derecha)
            {copy && ` · copia de la orden #${copy.number}`}
          </p>
          <PurchaseForm
            action={savePurchase.bind(null, null)}
            suppliers={suppliers}
            branchName={branch.name}
            status={null}
            cancelHref="/compras"
            initial={{
              supplierId: suppliers.some((s) => s.id === supplierId) ? supplierId : "",
              invoiceNumber: "",
              expectedAt: "",
              note: "",
              lines: copy ? await linesFromPurchase(copy.id, branch.id, { onlyActive: true }) : [],
            }}
          />
        </>
      ) : (
        <p className="mt-4 text-neutral-600">No tienes una sucursal asignada. Pide a un administrador que te asigne una.</p>
      )}
    </main>
  );
}
