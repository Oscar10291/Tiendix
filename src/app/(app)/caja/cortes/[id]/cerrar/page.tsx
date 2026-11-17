import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { dateTime, money } from "@/lib/format";
import { canAccessCashSession, cashSessionTotals } from "@/lib/pos/cash";
import { CloseCashForm } from "./close-form";

export const metadata = { title: "Cerrar caja · Tiendix" };

export default async function CloseCashPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("pos:use");
  const { id } = await params;
  const cs = await prisma.cashSession.findUnique({
    where: { id },
    include: { user: { select: { name: true } }, branch: { select: { name: true } } },
  });
  if (!cs || !canAccessCashSession(session, cs)) notFound();
  if (cs.status !== "OPEN") redirect(`/caja/cortes/${cs.id}`);

  const t = await cashSessionTotals(prisma, cs.id, cs.openingAmount);
  const own = cs.userId === session.user.id;

  return (
    <main className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={own ? "/caja" : "/caja/cortes"} className="text-blue-600 hover:underline">
          ← {own ? "Caja" : "Cortes de caja"}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">Cerrar caja (arqueo)</h1>
      <p className="text-sm text-neutral-500">
        Turno #{cs.number} de <strong>{cs.user.name}</strong> en {cs.branch.name} · abierto {dateTime(cs.openedAt)}
      </p>

      <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200">
        Cuenta todo el efectivo de la gaveta (incluido el fondo inicial) y escribe cuántos billetes y monedas hay de cada uno.
        Al guardar, el sistema compara con lo que debería haber.
        {!own && " Estás cerrando la caja de otro usuario."}
      </p>

      <CloseCashForm
        cashSessionId={cs.id}
        summary={{
          opening: cs.openingAmount.toFixed(2),
          cashSales: t.cashSales.toFixed(2),
          expected: t.expectedCash.toFixed(2),
          salesCount: t.salesCount,
          cancelledCount: t.cancelledCount,
        }}
      />
      <p className="mt-4 text-xs text-neutral-500">
        Fondo {money(cs.openingAmount)} + efectivo de {t.salesCount} {t.salesCount === 1 ? "venta" : "ventas"} {money(t.cashSales)} = esperado {money(t.expectedCash)}.
        {t.cancelledCount > 0 && (t.cancelledCount === 1 ? " La venta anulada en este turno no cuenta." : ` Las ${t.cancelledCount} ventas anuladas en este turno no cuentan.`)}
      </p>
    </main>
  );
}
