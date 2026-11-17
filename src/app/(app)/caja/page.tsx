import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { dateTime, money } from "@/lib/format";
import { getOpenCashSession } from "@/lib/pos/cash";
import { OpenCashForm } from "./open-form";
import { Pos } from "./pos";

export const metadata = { title: "Caja · Tiendix" };

export default async function CajaPage() {
  const session = await requirePermission("pos:use");
  const { branch } = session;
  const cash = await getOpenCashSession(session.user.id);

  if (!branch) {
    return <p className="text-neutral-600">No tienes una sucursal asignada. Pide a un administrador que te asigne una.</p>;
  }

  // Sin caja abierta: primero se abre el turno con el fondo inicial
  if (!cash) {
    return (
      <main className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Abrir caja</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Sucursal: <strong>{branch.name}</strong>. Cuenta el efectivo con el que empiezas (el &quot;sencillo&quot; para dar vuelto) y escríbelo aquí.
        </p>
        <OpenCashForm />
        <p className="mt-6 text-sm">
          <Link href="/caja/cortes" className="text-blue-600 hover:underline">
            Ver cortes de caja anteriores →
          </Link>
        </p>
      </main>
    );
  }

  // Caja abierta en otra sucursal
  if (cash.branchId !== branch.id) {
    return (
      <main className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Caja abierta en otra sucursal</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Tu caja está abierta en <strong>{cash.branch.name}</strong>. Cambia a esa sucursal (arriba a la derecha) para seguir cobrando, o ciérrala.
        </p>
        <Link href={`/caja/cortes/${cash.id}/cerrar`} className="btn-secondary mt-4">
          Cerrar esa caja
        </Link>
      </main>
    );
  }

  return (
    <main>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Caja</h1>
        <p className="text-sm text-neutral-500">
          Turno #{cash.number} · abierto {dateTime(cash.openedAt)} · fondo {money(cash.openingAmount)}
          {" · "}
          <Link href={`/ventas?turno=${cash.id}`} className="text-blue-600 hover:underline">
            Ventas del turno
          </Link>
          {" · "}
          <Link href={`/caja/cortes/${cash.id}/cerrar`} className="text-blue-600 hover:underline">
            Cerrar caja
          </Link>
        </p>
      </div>
      <Pos />
    </main>
  );
}
