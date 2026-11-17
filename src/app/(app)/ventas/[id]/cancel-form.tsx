"use client";

import { useActionState, useState } from "react";
import { cancelSale } from "../actions";

/** Anular la venta: pide el motivo y una confirmación. Solo se muestra a gerente/admin. */
export function CancelSaleForm({ saleId, number }: { saleId: string; number: number }) {
  const [state, action, pending] = useActionState(cancelSale, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="mt-8 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-red-600">
          Anular venta
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-3 rounded-lg border border-red-300 p-4 dark:border-red-900">
      <input type="hidden" name="saleId" value={saleId} />
      <h2 className="font-semibold text-red-700 dark:text-red-400">Anular la venta #{number}</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Los productos vuelven al inventario y la venta deja de contar en el total. No se puede deshacer. Si la caja de esta venta sigue
        abierta, devuelve el efectivo al cliente desde esa caja.
      </p>
      <label className="block">
        <span className="text-sm font-medium">Motivo</span>
        <input name="reason" required minLength={3} maxLength={200} autoFocus className="input mt-1" placeholder="Ej.: el cliente devolvió todo, error al cobrar…" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary bg-red-600 hover:bg-red-700">
          {pending ? "Anulando…" : "Sí, anular"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          No
        </button>
      </div>
    </form>
  );
}
