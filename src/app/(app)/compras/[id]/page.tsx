import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { date, dateTime, money, qty } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import { isOpen, PURCHASE_STATUS } from "@/lib/purchases/status";
import { Badge, Flash } from "@/components/flash";
import { MovementsTable } from "@/components/movements-table";
import { PrintPageButton } from "@/components/print-page-button";
import { markPurchaseOrdered } from "../actions";
import { CancelPurchaseForm, ReceivePurchaseForm } from "./status-forms";

export const metadata = { title: "Orden de compra · Tiendix" };

const MESSAGES: Record<string, string> = {
  creada: "Orden guardada como borrador.",
  enviada: "Orden guardada y marcada como enviada al proveedor.",
  editada: "Cambios guardados.",
  recibida: "Mercadería recibida: el inventario y los costos se actualizaron.",
  cancelada: "Orden cancelada.",
};

export default async function PurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { availableBranches } = await requirePermission("purchases:manage");
  const { id } = await params;
  const { ok } = await searchParams;

  const p = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      branch: { select: { name: true } },
      user: { select: { name: true } },
      receivedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
      items: { orderBy: { id: "asc" }, include: { product: { select: { id: true, name: true, sku: true, unit: true, cost: true } } } },
    },
  });
  if (!p || !availableBranches.some((b) => b.id === p.branchId)) notFound();

  const open = isOpen(p.status);
  const status = PURCHASE_STATUS[p.status];
  const movements =
    p.status === "RECEIVED"
      ? await prisma.stockMovement.findMany({
          where: { purchaseId: p.id },
          orderBy: { createdAt: "asc" },
          include: { user: { select: { name: true } }, product: { select: { id: true, name: true, sku: true, unit: true } } },
        })
      : [];

  return (
    <main className="mx-auto max-w-4xl">
      <p className="text-sm print:hidden">
        <Link href="/compras" className="text-blue-600 hover:underline">
          ← Compras
        </Link>
      </p>
      {ok && MESSAGES[ok] && <Flash kind="ok">{MESSAGES[ok]}</Flash>}

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Orden de compra #{p.number} <Badge tone={status.tone}>{status.label}</Badge>
          </h1>
          <p className="text-sm text-neutral-500">
            Proveedor:{" "}
            <Link href={`/compras/proveedores/${p.supplier.id}`} className="text-blue-600 hover:underline">
              {p.supplier.name}
            </Link>
            {p.supplier.taxId && ` (NIT ${p.supplier.taxId})`} · Entrega en {p.branch.name}
          </p>
          {(p.supplier.contactName || p.supplier.phone || p.supplier.email) && (
            <p className="text-sm text-neutral-500">Contacto: {[p.supplier.contactName, p.supplier.phone, p.supplier.email].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <PrintPageButton label="Imprimir orden" />
          <Link href={`/compras/nueva?desde=${p.id}`} className="btn-secondary" title="Crea una orden nueva con los mismos productos">
            Repetir pedido
          </Link>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Info label="Creada" value={`${dateTime(p.createdAt)} por ${p.user.name}`} />
        {p.orderedAt && <Info label="Enviada al proveedor" value={dateTime(p.orderedAt)} />}
        {p.expectedAt && <Info label="Entrega esperada" value={date(p.expectedAt)} />}
        {p.receivedAt && <Info label="Recibida" value={`${dateTime(p.receivedAt)} por ${p.receivedBy?.name ?? "—"}`} />}
        <Info label="Factura" value={p.invoiceNumber ?? "—"} />
        {p.note && <Info label="Nota" value={p.note} />}
      </dl>

      {p.status === "CANCELLED" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          Cancelada {p.cancelledAt ? dateTime(p.cancelledAt) : ""} por {p.cancelledBy?.name ?? "—"}. Motivo: {p.cancelReason}.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Producto</th>
              <th className="px-4 py-2 text-right font-medium">Cantidad</th>
              <th className="px-4 py-2 text-right font-medium">Costo unitario</th>
              <th className="px-4 py-2 text-right font-medium">Importe</th>
              <th className="px-4 py-2 text-right font-medium print:hidden">{p.status === "RECEIVED" ? "Costo promedio hoy" : "Costo actual"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {p.items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-2">
                  <Link href={`/productos/${i.product.id}`} className="hover:underline">
                    {i.product.name}
                  </Link>
                  <span className="block text-xs text-neutral-500">{i.product.sku}</span>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {qty(i.quantity)} {UNIT_LABELS[i.product.unit].short}
                </td>
                <td className="px-4 py-2 text-right">{money(i.unitCost)}</td>
                <td className="px-4 py-2 text-right font-medium">{money(i.total)}</td>
                <td className="px-4 py-2 text-right text-neutral-500 print:hidden">{money(i.product.cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 text-base font-semibold dark:border-neutral-800">
              <td className="px-4 py-2" colSpan={3}>
                Total
              </td>
              <td className="px-4 py-2 text-right">{money(p.total)}</td>
              <td className="print:hidden" />
            </tr>
          </tfoot>
        </table>
      </div>

      {open && (
        <div className="mt-6 flex flex-wrap items-start gap-2 print:hidden">
          <ReceivePurchaseForm purchaseId={p.id} invoiceNumber={p.invoiceNumber ?? ""} branchName={p.branch.name} lines={p.items.length} />
          {p.status === "DRAFT" && (
            <form action={markPurchaseOrdered.bind(null, p.id)}>
              <button className="btn-secondary">Marcar como enviada</button>
            </form>
          )}
          <Link href={`/compras/${p.id}/editar`} className="btn-secondary">
            Editar
          </Link>
          <CancelPurchaseForm purchaseId={p.id} number={p.number} />
        </div>
      )}
      {open && <p className="mt-2 text-xs text-neutral-500 print:hidden">{status.help}</p>}

      {movements.length > 0 && (
        <section className="mt-8 print:hidden">
          <h2 className="text-lg font-semibold">Entradas al inventario</h2>
          <MovementsTable movements={movements} />
        </section>
      )}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-neutral-500">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}
