import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { dateTime, money } from "@/lib/format";
import { canAccessCashSession, cashSessionTotals } from "@/lib/pos/cash";
import { DENOMINATIONS } from "@/lib/pos/money";
import { Badge, Flash } from "@/components/flash";
import { CashDifference } from "@/components/cash-difference";
import { PrintPageButton } from "@/components/print-page-button";

export const metadata = { title: "Corte de caja · Tiendix" };

export default async function CashSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cerrada?: string }>;
}) {
  const session = await requirePermission("pos:use");
  const { id } = await params;
  const { cerrada } = await searchParams;
  const cs = await prisma.cashSession.findUnique({
    where: { id },
    include: {
      user: { select: { name: true } },
      branch: { select: { name: true } },
      sales: { orderBy: { number: "asc" }, select: { id: true, number: true, createdAt: true, total: true, status: true, cancelledAt: true } },
    },
  });
  if (!cs || !canAccessCashSession(session, cs)) notFound();

  const open = cs.status === "OPEN";
  const live = open ? await cashSessionTotals(prisma, cs.id, cs.openingAmount) : null;
  const counts = (cs.denominations ?? {}) as Record<string, number>;
  // Ventas anuladas después de cerrar la caja: no cambian el arqueo guardado
  const cancelledAfter = cs.closedAt ? cs.sales.filter((s) => s.cancelledAt && s.cancelledAt > cs.closedAt!) : [];
  const own = cs.userId === session.user.id;

  return (
    <main className="mx-auto max-w-3xl">
      <p className="text-sm print:hidden">
        <Link href="/caja/cortes" className="text-blue-600 hover:underline">
          ← Cortes de caja
        </Link>
      </p>
      {cerrada && <Flash kind="ok">Caja cerrada. Puedes imprimir este corte y entregarlo junto con el efectivo.</Flash>}

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Corte de caja #{cs.number} {open ? <Badge tone="green">Abierta</Badge> : <Badge tone="gray">Cerrada</Badge>}
          </h1>
          <p className="text-sm text-neutral-500">
            {cs.user.name} · {cs.branch.name}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          {open && (
            <Link href={`/caja/cortes/${cs.id}/cerrar`} className="btn-primary">
              {own ? "Cerrar caja" : "Cerrar esta caja"}
            </Link>
          )}
          <Link href={`/ventas?turno=${cs.id}`} className="btn-secondary">
            Ver ventas
          </Link>
          {!open && <PrintPageButton />}
        </div>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="Apertura" value={dateTime(cs.openedAt)} />
        <Row label="Cierre" value={cs.closedAt ? dateTime(cs.closedAt) : "—"} />
        <Row label="Fondo inicial" value={money(cs.openingAmount)} />
        <Row label="Ventas cobradas" value={String(open ? live!.salesCount : (cs.salesCount ?? 0))} />
        <Row label="Efectivo de ventas" value={money(open ? live!.cashSales : cs.cashSales)} />
        <Row label={open ? "Efectivo esperado ahora" : "Efectivo esperado"} value={money(open ? live!.expectedCash : cs.expectedCash)} strong />
        {!open && (
          <>
            <Row label="Efectivo contado" value={money(cs.countedCash)} strong />
            <div className="flex justify-between border-b border-neutral-100 py-1 dark:border-neutral-900">
              <dt className="text-neutral-500">Diferencia</dt>
              <dd className="font-semibold">{cs.difference ? <CashDifference value={cs.difference} /> : "—"}</dd>
            </div>
          </>
        )}
      </dl>
      {cs.openingNote && <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">Nota de apertura: {cs.openingNote}</p>}
      {cs.closingNote && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Nota de cierre: {cs.closingNote}</p>}

      {!open && Object.keys(counts).length > 0 && (
        <>
          <h2 className="mt-6 font-semibold">Conteo del efectivo</h2>
          <table className="mt-2 w-full max-w-sm text-sm">
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {DENOMINATIONS.filter((d) => counts[d.value]).map((d) => (
                <tr key={d.value}>
                  <td className="py-1">{d.label}</td>
                  <td className="py-1 text-right">× {counts[d.value]}</td>
                  <td className="py-1 text-right">{money((d.cents * counts[d.value]) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {cancelledAfter.length > 0 && (
        <p className="mt-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Después del cierre se anularon {cancelledAfter.length} {cancelledAfter.length === 1 ? "venta" : "ventas"} de este turno (
          {cancelledAfter.map((s) => `#${s.number}`).join(", ")}) por {money(cancelledAfter.reduce((sum, s) => sum + Number(s.total), 0))}. El arqueo de arriba no cambia; ese dinero se devolvió aparte.
        </p>
      )}

      <h2 className="mt-6 font-semibold">Ventas del turno</h2>
      <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
        {cs.sales.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-3 py-1.5">
            <Link href={`/ventas/${s.id}`} className="text-blue-600 hover:underline">
              Venta #{s.number}
            </Link>
            <span className="text-neutral-500">{dateTime(s.createdAt)}</span>
            <span className={s.status === "CANCELLED" ? "text-neutral-400 line-through" : ""}>{money(s.total)}</span>
          </li>
        ))}
        {cs.sales.length === 0 && <li className="px-3 py-4 text-center text-neutral-500">Sin ventas.</li>}
      </ul>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between border-b border-neutral-100 py-1 dark:border-neutral-900">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={strong ? "font-semibold" : undefined}>{value}</dd>
    </div>
  );
}
