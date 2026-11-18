"use client";

import { useActionState, useState } from "react";
import { cancelPurchase, receivePurchase } from "../actions";

/** Recibir toda la mercadería: confirma la factura y sube el stock. */
export function ReceivePurchaseForm({ purchaseId, invoiceNumber, branchName, lines }: { purchaseId: string; invoiceNumber: string; branchName: string; lines: number }) {
  const [state, action, pending] = useActionState(receivePurchase, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        Recibir mercadería
      </button>
    );
  }

  return (
    <form action={action} className="w-full space-y-3 rounded-lg border border-green-500 p-4">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <h2 className="font-semibold">Recibir toda la orden</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Confirma que llegaron completas las {lines} líneas de la orden con las cantidades y costos de abajo. Se sumarán a la existencia de{" "}
        <strong>{branchName}</strong>, quedarán en el kárdex y se recalculará el costo promedio de cada producto. Si algo cambió (cantidad o
        costo), primero edita la orden.
      </p>
      <label className="block max-w-sm">
        <span className="text-sm font-medium">Nº de factura del proveedor</span>
        <span className="ml-2 text-xs text-neutral-500">Opcional</span>
        <input name="invoiceNumber" defaultValue={invoiceNumber} maxLength={40} className="input mt-1" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Recibiendo…" : "Sí, recibir y sumar al inventario"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          No
        </button>
      </div>
    </form>
  );
}

/** Cancelar una orden que no se ha recibido. Pide el motivo. */
export function CancelPurchaseForm({ purchaseId, number }: { purchaseId: string; number: number }) {
  const [state, action, pending] = useActionState(cancelPurchase, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-red-600">
        Cancelar orden
      </button>
    );
  }

  return (
    <form action={action} className="w-full space-y-3 rounded-lg border border-red-300 p-4 dark:border-red-900">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <h2 className="font-semibold text-red-700 dark:text-red-400">Cancelar la orden #{number}</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">La orden queda en el historial como cancelada. No toca el inventario. No se puede deshacer.</p>
      <label className="block">
        <span className="text-sm font-medium">Motivo</span>
        <input name="reason" required minLength={3} maxLength={200} autoFocus className="input mt-1" placeholder="Ej.: el proveedor no tiene existencia, se pidió a otro…" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary bg-red-600 hover:bg-red-700">
          {pending ? "Cancelando…" : "Sí, cancelar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          No
        </button>
      </div>
    </form>
  );
}
