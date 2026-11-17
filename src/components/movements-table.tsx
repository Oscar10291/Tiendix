import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { dateTime, money, qty } from "@/lib/format";
import { MOVEMENT_TYPE_LABELS, reasonLabel, UNIT_LABELS } from "@/lib/inventory/reasons";

type Movement = Prisma.StockMovementGetPayload<{
  include: { user: { select: { name: true } }; product: { select: { id: true; name: true; sku: true; unit: true } } };
}>;

/** Tabla del kárdex: fecha, tipo, motivo, cantidad (+/−), saldo y usuario. */
export function MovementsTable({ movements, hideProduct }: { movements: Movement[]; hideProduct?: boolean }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
          <tr>
            <th className="px-4 py-2 font-medium">Fecha</th>
            {!hideProduct && <th className="px-4 py-2 font-medium">Producto</th>}
            <th className="px-4 py-2 font-medium">Movimiento</th>
            <th className="px-4 py-2 text-right font-medium">Cantidad</th>
            <th className="px-4 py-2 text-right font-medium">Saldo</th>
            <th className="px-4 py-2 text-right font-medium">Costo u.</th>
            <th className="px-4 py-2 font-medium">Usuario</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {movements.map((m) => {
            const positive = !m.quantity.isNegative();
            const unit = UNIT_LABELS[m.product.unit].short;
            return (
              <tr key={m.id}>
                <td className="px-4 py-2 whitespace-nowrap">{dateTime(m.createdAt)}</td>
                {!hideProduct && (
                  <td className="px-4 py-2">
                    <Link href={`/productos/${m.product.id}`} className="hover:underline">
                      {m.product.name}
                    </Link>
                    <span className="block text-xs text-neutral-500">{m.product.sku}</span>
                  </td>
                )}
                <td className="px-4 py-2">
                  {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                  {(m.reason || m.note) && (
                    <span className="block text-xs text-neutral-500">{[reasonLabel(m.reason), m.note].filter(Boolean).join(" · ")}</span>
                  )}
                </td>
                <td className={`px-4 py-2 text-right font-medium whitespace-nowrap ${positive ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>
                  {positive ? "+" : "−"}
                  {qty(m.quantity.abs())} {unit}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{m.balance ? `${qty(m.balance)} ${unit}` : "—"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{m.unitCost ? money(m.unitCost) : "—"}</td>
                <td className="px-4 py-2">{m.user?.name ?? "—"}</td>
              </tr>
            );
          })}
          {movements.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                No hay movimientos.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
