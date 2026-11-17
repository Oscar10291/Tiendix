import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dateTime, money, qty } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import { canAccessSale } from "@/lib/pos/cash";
import { Badge } from "@/components/flash";
import { PrintTicketButton } from "@/components/print-ticket";
import { CancelSaleForm } from "./cancel-form";

export const metadata = { title: "Venta · Tiendix" };

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("pos:use");
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
      payments: true,
      user: { select: { name: true } },
      cancelledBy: { select: { name: true } },
      branch: { select: { name: true } },
      cashSession: { select: { id: true, number: true } },
    },
  });
  if (!sale || !canAccessSale(session, sale)) notFound();

  const cancelled = sale.status === "CANCELLED";
  const cash = sale.payments.find((p) => p.method === "CASH");
  const canCancel = !cancelled && can(session.user.role, "sales:cancel");
  const lineDiscounts = sale.items.reduce((s, i) => s + Number(i.discount), 0);

  return (
    <main className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href="/ventas" className="text-blue-600 hover:underline">
          ← Ventas
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Venta #{sale.number} {cancelled ? <Badge tone="red">Anulada</Badge> : <Badge tone="green">Vigente</Badge>}
          </h1>
          <p className="text-sm text-neutral-500">
            {dateTime(sale.createdAt)} · {sale.user.name} · {sale.branch.name}
            {sale.cashSession && (
              <>
                {" · "}
                <Link href={`/caja/cortes/${sale.cashSession.id}`} className="text-blue-600 hover:underline">
                  turno #{sale.cashSession.number}
                </Link>
              </>
            )}
          </p>
        </div>
        <PrintTicketButton saleId={sale.id} />
      </div>

      {cancelled && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          Anulada {sale.cancelledAt ? dateTime(sale.cancelledAt) : ""} por {sale.cancelledBy?.name ?? "—"}. Motivo: {sale.cancelReason}. Las existencias se devolvieron al inventario.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Producto</th>
              <th className="px-4 py-2 text-right font-medium">Cantidad</th>
              <th className="px-4 py-2 text-right font-medium">Precio</th>
              <th className="px-4 py-2 text-right font-medium">Descuento</th>
              <th className="px-4 py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {sale.items.map((i) => (
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
                <td className="px-4 py-2 text-right">{money(i.unitPrice)}</td>
                <td className="px-4 py-2 text-right">{Number(i.discount) > 0 ? `−${money(i.discount)}` : "—"}</td>
                <td className="px-4 py-2 text-right font-medium">{money(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
        {lineDiscounts > 0 && <Row label="Descuentos en productos" value={`−${money(lineDiscounts)}`} />}
        <Row label="Subtotal" value={money(sale.subtotal)} />
        {Number(sale.discount) > 0 && <Row label="Descuento a la venta" value={`−${money(sale.discount)}`} />}
        <Row label="Total" value={money(sale.total)} strong />
        <Row label="IVA incluido" value={money(sale.tax)} />
        {cash && (
          <>
            <Row label="Efectivo recibido" value={money(cash.tendered ?? cash.amount)} />
            <Row label="Cambio" value={money(cash.change ?? 0)} />
          </>
        )}
      </dl>

      {canCancel && <CancelSaleForm saleId={sale.id} number={sale.number} />}
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-neutral-200 pt-1 text-base font-semibold dark:border-neutral-800" : ""}`}>
      <dt className={strong ? undefined : "text-neutral-500"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
