"use client";

import { useActionState } from "react";
import { openCashSession } from "./actions";

export function OpenCashForm() {
  const [state, action, pending] = useActionState(openCashSession, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Fondo inicial (Q)</span>
        <input name="openingAmount" inputMode="decimal" required autoFocus defaultValue="0.00" onFocus={(e) => e.currentTarget.select()} className="input mt-1 text-lg" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Nota</span>
        <span className="ml-2 text-xs text-neutral-500">Opcional</span>
        <input name="note" maxLength={200} className="input mt-1" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-base">
        {pending ? "Abriendo…" : "Abrir caja"}
      </button>
    </form>
  );
}
