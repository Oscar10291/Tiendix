"use client";

import { useActionState } from "react";
import { changeOwnPassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changeOwnPassword, {});

  return (
    <form action={action} className="mt-4 space-y-4" key={state.ok ? "ok" : "form"}>
      <label className="block">
        <span className="text-sm font-medium">Contraseña actual</span>
        <input name="current" type="password" autoComplete="current-password" required className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Contraseña nueva</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Repite la contraseña nueva</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className="input mt-1" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-green-700">Contraseña actualizada. Se cerró tu sesión en otros dispositivos.</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
