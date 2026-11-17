import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dateTime, money } from "@/lib/format";
import { Badge } from "@/components/flash";
import { Pager, pageParam } from "@/components/pager";
import { CashDifference as Difference } from "@/components/cash-difference";

export const metadata = { title: "Cortes de caja · Tiendix" };
const PAGE_SIZE = 30;

export default async function CashSessionsPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const session = await requirePermission("pos:use");
  const { branch, user } = session;
  const page = pageParam((await searchParams).pagina);
  if (!branch) return <p className="text-neutral-600">No tienes una sucursal asignada.</p>;

  // Gerente y admin ven los turnos de todos los cajeros; el cajero solo los suyos
  const seeAll = can(user.role, "sales:view");
  const where: Prisma.CashSessionWhereInput = { branchId: branch.id, ...(seeAll ? {} : { userId: user.id }) };
  const [total, rows] = await Promise.all([
    prisma.cashSession.count({ where }),
    prisma.cashSession.findMany({
      where,
      orderBy: { openedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return (
    <main>
      <p className="text-sm">
        <Link href="/caja" className="text-blue-600 hover:underline">
          ← Caja
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">Cortes de caja</h1>
      <p className="text-sm text-neutral-500">
        {seeAll ? "Turnos de todos los cajeros" : "Tus turnos"} en {branch.name}
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Turno</th>
              <th className="px-4 py-2 font-medium">Cajero</th>
              <th className="px-4 py-2 font-medium">Apertura</th>
              <th className="px-4 py-2 font-medium">Cierre</th>
              <th className="px-4 py-2 text-right font-medium">Ventas</th>
              <th className="px-4 py-2 text-right font-medium">Esperado</th>
              <th className="px-4 py-2 text-right font-medium">Contado</th>
              <th className="px-4 py-2 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((cs) => (
              <tr key={cs.id}>
                <td className="px-4 py-2">
                  <Link href={`/caja/cortes/${cs.id}`} className="text-blue-600 hover:underline">
                    #{cs.number}
                  </Link>
                </td>
                <td className="px-4 py-2">{cs.user.name}</td>
                <td className="px-4 py-2 whitespace-nowrap">{dateTime(cs.openedAt)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{cs.closedAt ? dateTime(cs.closedAt) : <Badge tone="green">Abierta</Badge>}</td>
                <td className="px-4 py-2 text-right">{cs.salesCount ?? "—"}</td>
                <td className="px-4 py-2 text-right">{cs.expectedCash ? money(cs.expectedCash) : "—"}</td>
                <td className="px-4 py-2 text-right">{cs.countedCash ? money(cs.countedCash) : "—"}</td>
                <td className="px-4 py-2 text-right">{cs.difference ? <Difference value={cs.difference} /> : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  Todavía no hay turnos de caja.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} params={{}} />
    </main>
  );
}
