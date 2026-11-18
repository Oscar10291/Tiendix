import Link from "next/link";
import { PurchaseStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { dateTime, money } from "@/lib/format";
import { Badge } from "@/components/flash";

export const metadata = { title: "Proveedores · Tiendix" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string }> }) {
  const { availableBranches } = await requirePermission("purchases:manage");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const showInactive = sp.ver === "todos";

  const where: Prisma.SupplierWhereInput = {
    ...(showInactive ? {} : { active: true }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { taxId: { contains: q.replace(/\s/g, ""), mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const suppliers = await prisma.supplier.findMany({ where, orderBy: { name: "asc" }, take: 200 });

  // Total comprado (solo recibidas) y última compra, en las sucursales del usuario
  const stats = await prisma.purchase.groupBy({
    by: ["supplierId"],
    where: {
      supplierId: { in: suppliers.map((s) => s.id) },
      branchId: { in: availableBranches.map((b) => b.id) },
      status: PurchaseStatus.RECEIVED,
    },
    _sum: { total: true },
    _count: true,
    _max: { receivedAt: true },
  });
  const statsBy = new Map(stats.map((s) => [s.supplierId, s]));

  return (
    <main>
      <p className="text-sm">
        <Link href="/compras" className="text-blue-600 hover:underline">
          ← Compras
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Proveedores</h1>
        <Link href="/compras/proveedores/nuevo" className="btn-primary">
          + Nuevo proveedor
        </Link>
      </div>

      <form className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="min-w-64 flex-1">
          <span className="block text-xs text-neutral-500">Buscar</span>
          <input name="q" defaultValue={q} placeholder="Nombre, NIT o contacto" className="input py-1.5" />
        </label>
        <label className="flex items-center gap-2 py-1.5">
          <input type="checkbox" name="ver" value="todos" defaultChecked={showInactive} />
          Incluir inactivos
        </label>
        <button type="submit" className="btn-secondary py-1.5">
          Buscar
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Proveedor</th>
              <th className="px-4 py-2 font-medium">Contacto</th>
              <th className="px-4 py-2 text-right font-medium">Compras recibidas</th>
              <th className="px-4 py-2 text-right font-medium">Total comprado</th>
              <th className="px-4 py-2 font-medium">Última recepción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {suppliers.map((s) => {
              const st = statsBy.get(s.id);
              return (
                <tr key={s.id} className={s.active ? "" : "text-neutral-400"}>
                  <td className="px-4 py-2">
                    <Link href={`/compras/proveedores/${s.id}`} className="font-medium text-blue-600 hover:underline">
                      {s.name}
                    </Link>{" "}
                    {!s.active && <Badge tone="gray">Inactivo</Badge>}
                    {s.taxId && <span className="block text-xs text-neutral-500">NIT {s.taxId}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {s.contactName ?? "—"}
                    {(s.phone || s.email) && <span className="block text-xs text-neutral-500">{[s.phone, s.email].filter(Boolean).join(" · ")}</span>}
                  </td>
                  <td className="px-4 py-2 text-right">{st?._count ?? 0}</td>
                  <td className="px-4 py-2 text-right font-medium">{money(st?._sum.total ?? 0)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{st?._max.receivedAt ? dateTime(st._max.receivedAt) : "—"}</td>
                </tr>
              );
            })}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  {q ? "Ningún proveedor coincide con la búsqueda." : "Aún no hay proveedores. Crea el primero para registrar compras."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
