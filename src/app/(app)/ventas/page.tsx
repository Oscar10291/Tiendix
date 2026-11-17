import Link from "next/link";
import { SaleStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dateTime, dayStart, money, todayISO } from "@/lib/format";
import { Badge } from "@/components/flash";
import { Pager, pageParam } from "@/components/pager";

export const metadata = { title: "Ventas · Tiendix" };
const PAGE_SIZE = 50;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; estado?: string; numero?: string; turno?: string; pagina?: string }>;
}) {
  const session = await requirePermission("pos:use");
  const { branch, user } = session;
  const sp = await searchParams;
  const page = pageParam(sp.pagina);
  if (!branch) return <p className="text-neutral-600">No tienes una sucursal asignada.</p>;

  const seeAll = can(user.role, "sales:view");
  const where: Prisma.SaleWhereInput = { branchId: branch.id, ...(seeAll ? {} : { userId: user.id }) };
  const number = Number(sp.numero);
  // Por defecto: ventas de hoy (o del turno si se llegó desde la caja)
  const fecha = sp.turno || number ? sp.fecha : (sp.fecha ?? todayISO());
  if (Number.isInteger(number) && number > 0) where.number = number;
  if (sp.turno) where.cashSessionId = sp.turno;
  const from = dayStart(fecha);
  if (from) where.createdAt = { gte: from, lt: dayStart(fecha, 1) };
  if (sp.estado === "anuladas") where.status = SaleStatus.CANCELLED;
  if (sp.estado === "vigentes") where.status = SaleStatus.COMPLETED;

  const [total, sales, sums] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true } }, _count: { select: { items: true } } },
    }),
    prisma.sale.aggregate({ where: { ...where, status: SaleStatus.COMPLETED }, _sum: { total: true }, _count: true }),
  ]);

  return (
    <main>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <p className="text-sm">
          <Link href="/caja/cortes" className="text-blue-600 hover:underline">
            Cortes de caja →
          </Link>
        </p>
      </div>
      <p className="text-sm text-neutral-500">
        {seeAll ? "Todas las ventas" : "Tus ventas"} de {branch.name}
        {sp.turno && " · solo un turno de caja"}
      </p>

      <form className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        {sp.turno && <input type="hidden" name="turno" value={sp.turno} />}
        <label>
          <span className="block text-xs text-neutral-500">Fecha</span>
          <input type="date" name="fecha" defaultValue={fecha ?? ""} className="input py-1.5" />
        </label>
        <label>
          <span className="block text-xs text-neutral-500">Nº de venta</span>
          <input name="numero" inputMode="numeric" defaultValue={sp.numero ?? ""} className="input w-28 py-1.5" />
        </label>
        <label>
          <span className="block text-xs text-neutral-500">Estado</span>
          <select name="estado" defaultValue={sp.estado ?? ""} className="input py-1.5">
            <option value="">Todas</option>
            <option value="vigentes">Vigentes</option>
            <option value="anuladas">Anuladas</option>
          </select>
        </label>
        <button type="submit" className="btn-secondary py-1.5">
          Filtrar
        </button>
        <Link href="/ventas" className="py-1.5 text-blue-600 hover:underline">
          Hoy
        </Link>
      </form>

      <p className="mt-4 text-sm">
        <strong>{sums._count}</strong> {sums._count === 1 ? "venta vigente" : "ventas vigentes"} por <strong>{money(sums._sum.total)}</strong>
      </p>

      <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Venta</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Cajero</th>
              <th className="px-4 py-2 text-right font-medium">Líneas</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {sales.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2">
                  <Link href={`/ventas/${s.id}`} className="text-blue-600 hover:underline">
                    #{s.number}
                  </Link>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{dateTime(s.createdAt)}</td>
                <td className="px-4 py-2">{s.user.name}</td>
                <td className="px-4 py-2 text-right">{s._count.items}</td>
                <td className={`px-4 py-2 text-right font-medium ${s.status === "CANCELLED" ? "text-neutral-400 line-through" : ""}`}>{money(s.total)}</td>
                <td className="px-4 py-2">{s.status === "CANCELLED" ? <Badge tone="red">Anulada</Badge> : <Badge tone="green">Vigente</Badge>}</td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No hay ventas con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} params={{ fecha, numero: sp.numero, estado: sp.estado, turno: sp.turno }} />
    </main>
  );
}
