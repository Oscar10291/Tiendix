import Link from "next/link";
import { PurchaseStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { date, dateTime, money } from "@/lib/format";
import { PURCHASE_STATUS } from "@/lib/purchases/status";
import { Badge } from "@/components/flash";
import { Pager, pageParam } from "@/components/pager";

export const metadata = { title: "Compras · Tiendix" };
const PAGE_SIZE = 50;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; proveedor?: string; numero?: string; pagina?: string }>;
}) {
  const { branch } = await requirePermission("purchases:manage");
  const sp = await searchParams;
  const page = pageParam(sp.pagina);
  if (!branch) return <p className="text-neutral-600">No tienes una sucursal asignada.</p>;

  const where: Prisma.PurchaseWhereInput = { branchId: branch.id };
  // "abiertas" (por defecto) = borradores y enviadas
  const estado = sp.estado ?? "abiertas";
  if (estado === "abiertas") where.status = { in: [PurchaseStatus.DRAFT, PurchaseStatus.ORDERED] };
  else if (estado in PURCHASE_STATUS) where.status = estado as PurchaseStatus;
  if (sp.proveedor) where.supplierId = sp.proveedor;
  const number = Number(sp.numero);
  if (Number.isInteger(number) && number > 0) {
    where.number = number;
    delete where.status;
  }

  const now = new Date();
  const [total, purchases, suppliers, counts] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { supplier: { select: { id: true, name: true } }, _count: { select: { items: true } } },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, active: true } }),
    prisma.purchase.groupBy({ by: ["status"], where: { branchId: branch.id }, _count: true, _sum: { total: true } }),
  ]);
  const countOf = (s: PurchaseStatus) => counts.find((c) => c.status === s);
  const ordered = countOf(PurchaseStatus.ORDERED);

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Compras</h1>
        <div className="flex gap-2">
          <Link href="/compras/proveedores" className="btn-secondary">
            Proveedores
          </Link>
          <Link href="/compras/nueva" className="btn-primary">
            + Nueva orden
          </Link>
        </div>
      </div>
      <p className="text-sm text-neutral-500">
        Órdenes de compra de {branch.name}
        {ordered && ordered._count > 0 && (
          <>
            {" "}
            · {ordered._count} {ordered._count === 1 ? "enviada esperando mercadería" : "enviadas esperando mercadería"} ({money(ordered._sum.total)})
          </>
        )}
      </p>

      <form className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <label>
          <span className="block text-xs text-neutral-500">Estado</span>
          <select name="estado" defaultValue={estado} className="input py-1.5">
            <option value="abiertas">Abiertas (borrador y enviadas)</option>
            {Object.entries(PURCHASE_STATUS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label} ({countOf(k as PurchaseStatus)?._count ?? 0})
              </option>
            ))}
            <option value="todas">Todas</option>
          </select>
        </label>
        <label>
          <span className="block text-xs text-neutral-500">Proveedor</span>
          <select name="proveedor" defaultValue={sp.proveedor ?? ""} className="input py-1.5">
            <option value="">Todos</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.active ? "" : " (inactivo)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs text-neutral-500">Nº de orden</span>
          <input name="numero" inputMode="numeric" defaultValue={sp.numero ?? ""} className="input w-28 py-1.5" />
        </label>
        <button type="submit" className="btn-secondary py-1.5">
          Filtrar
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Orden</th>
              <th className="px-4 py-2 font-medium">Creada</th>
              <th className="px-4 py-2 font-medium">Proveedor</th>
              <th className="px-4 py-2 font-medium">Entrega</th>
              <th className="px-4 py-2 text-right font-medium">Productos</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {purchases.map((p) => {
              const late = p.status === "ORDERED" && p.expectedAt && p.expectedAt < now;
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    <Link href={`/compras/${p.id}`} className="text-blue-600 hover:underline">
                      #{p.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{dateTime(p.createdAt)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/compras/proveedores/${p.supplier.id}`} className="hover:underline">
                      {p.supplier.name}
                    </Link>
                    {p.invoiceNumber && <span className="block text-xs text-neutral-500">Factura {p.invoiceNumber}</span>}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {p.receivedAt ? (
                      <span className="text-neutral-500">recibida {dateTime(p.receivedAt)}</span>
                    ) : p.expectedAt ? (
                      <span className={late ? "font-medium text-red-600" : ""}>
                        {date(p.expectedAt)}
                        {late && " (atrasada)"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{p._count.items}</td>
                  <td className={`px-4 py-2 text-right font-medium ${p.status === "CANCELLED" ? "text-neutral-400 line-through" : ""}`}>{money(p.total)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Badge>
                  </td>
                </tr>
              );
            })}
            {purchases.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  {estado === "abiertas" ? "No hay órdenes abiertas. Crea una con «+ Nueva orden»." : "No hay órdenes con estos filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} params={{ estado: sp.estado, proveedor: sp.proveedor, numero: sp.numero }} />
    </main>
  );
}
