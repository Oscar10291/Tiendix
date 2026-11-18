import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { linesFromPurchase, supplierOptions, toDateInput } from "@/lib/purchases/form";
import { isOpen } from "@/lib/purchases/status";
import { savePurchase } from "../../actions";
import { PurchaseForm } from "../../purchase-form";

export const metadata = { title: "Editar orden de compra · Tiendix" };

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { availableBranches } = await requirePermission("purchases:manage");
  const { id } = await params;
  const p = await prisma.purchase.findUnique({ where: { id }, include: { branch: { select: { name: true } } } });
  if (!p || !availableBranches.some((b) => b.id === p.branchId)) notFound();
  if (!isOpen(p.status)) redirect(`/compras/${id}`);

  return (
    <main>
      <h1 className="text-2xl font-bold">Editar orden de compra #{p.number}</h1>
      <p className="text-sm text-neutral-500">
        Se recibirá en <strong>{p.branch.name}</strong>
      </p>
      <PurchaseForm
        action={savePurchase.bind(null, id)}
        suppliers={await supplierOptions(p.supplierId)}
        branchName={p.branch.name}
        status={p.status as "DRAFT" | "ORDERED"}
        cancelHref={`/compras/${id}`}
        initial={{
          supplierId: p.supplierId,
          invoiceNumber: p.invoiceNumber ?? "",
          expectedAt: toDateInput(p.expectedAt),
          note: p.note ?? "",
          lines: await linesFromPurchase(id, p.branchId),
        }}
      />
    </main>
  );
}
