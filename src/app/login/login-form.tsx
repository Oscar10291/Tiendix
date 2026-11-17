"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <label className="block">
        <span className="text-sm font-medium">Correo</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          defaultValue={state.email}
          className="input mt-1"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Contraseña</span>
        <input name="password" type="password" autoComplete="current-password" required className="input mt-1" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
