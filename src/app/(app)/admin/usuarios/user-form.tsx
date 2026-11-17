"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Role } from "@prisma/client";
import type { UserFormState } from "./actions";

type Props = {
  action: (prev: UserFormState, formData: FormData) => Promise<UserFormState>;
  branches: { id: string; name: string; code: string }[];
  roles: { value: Role; label: string; description: string }[];
  user?: { name: string; email: string; role: Role; active: boolean; branchIds: string[] };
  isSelf?: boolean;
};

export function UserForm({ action, branches, roles, user, isSelf }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [role, setRole] = useState<Role>(user?.role ?? "CASHIER");
  const err = state.fieldErrors ?? {};
  // Tras un error, mostramos lo que se había escrito (React vacía el formulario al enviar)
  const v = state.values ?? user;
  const isEdit = Boolean(user);

  return (
    <form action={formAction} className="mt-6 max-w-xl space-y-5">
      <Field label="Nombre" error={err.name}>
        <input name="name" required defaultValue={v?.name} className="input mt-1" />
      </Field>

      <Field label="Correo" error={err.email}>
        <input name="email" type="email" required defaultValue={v?.email} autoComplete="off" className="input mt-1" />
      </Field>

      <Field
        label={isEdit ? "Contraseña nueva" : "Contraseña"}
        hint={isEdit ? "Déjala vacía para no cambiarla." : "Mínimo 8 caracteres."}
        error={err.password}
      >
        <input name="password" type="password" required={!isEdit} minLength={8} autoComplete="new-password" className="input mt-1" />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Rol</legend>
        {isSelf && <p className="text-xs text-neutral-500">No puedes cambiar tu propio rol.</p>}
        <div className="mt-2 space-y-2">
          {roles.map((r) => (
            <label key={r.value} className="flex gap-3 rounded-md border border-neutral-200 p-3 has-[:checked]:border-blue-500 dark:border-neutral-800">
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={role === r.value}
                onChange={() => setRole(r.value)}
                disabled={isSelf && r.value !== role}
              />
              <span>
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-neutral-500">{r.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Sucursales</legend>
        <p className="text-xs text-neutral-500">
          {role === "ADMIN"
            ? "El administrador ve todas las sucursales; marcar alguna es opcional."
            : "Sucursales donde podrá trabajar."}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="branchIds" value={b.id} defaultChecked={v?.branchIds.includes(b.id)} />
              {b.name} <span className="text-xs text-neutral-500">({b.code})</span>
            </label>
          ))}
        </div>
        {err.branchIds && <p className="mt-1 text-sm text-red-600">{err.branchIds}</p>}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={v?.active ?? true} disabled={isSelf} />
        Usuario activo (puede iniciar sesión)
      </label>
      {/* Un checkbox deshabilitado no se envía: mantenemos el valor para uno mismo */}
      {isSelf && <input type="hidden" name="active" value="on" />}

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear usuario"}
        </button>
        <Link href="/admin/usuarios" className="btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-2 text-xs text-neutral-500">{hint}</span>}
      {children}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}
