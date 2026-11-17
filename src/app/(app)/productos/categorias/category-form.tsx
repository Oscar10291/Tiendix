"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { CategoryFormState } from "./actions";

type Props = {
  action: (prev: CategoryFormState, formData: FormData) => Promise<CategoryFormState>;
  parents: { id: string; path: string }[];
  category?: { name: string; parentId: string; active: boolean };
  /** En la lista se muestra compacto, en una sola fila */
  inline?: boolean;
};

export function CategoryForm({ action, parents, category, inline }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? category;

  return (
    <form action={formAction} className={inline ? "flex flex-wrap items-start gap-2" : "mt-6 max-w-md space-y-4"}>
      <label className={inline ? "min-w-48 flex-1" : "block"}>
        <span className={inline ? "sr-only" : "text-sm font-medium"}>Nombre</span>
        <input name="name" required maxLength={60} defaultValue={v?.name} placeholder="Nombre de la categoría" className="input mt-1" />
      </label>
      <label className={inline ? "min-w-48" : "block"}>
        <span className={inline ? "sr-only" : "text-sm font-medium"}>Dentro de</span>
        <select name="parentId" defaultValue={v?.parentId ?? ""} className="input mt-1">
          <option value="">(Categoría principal)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.path}
            </option>
          ))}
        </select>
      </label>
      {category && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={v?.active ?? true} />
          Activa (se puede elegir al crear o editar productos)
        </label>
      )}
      <div className={inline ? "mt-1" : "flex gap-3"}>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Guardando…" : category ? "Guardar cambios" : "+ Agregar"}
        </button>
        {!inline && (
          <Link href="/productos/categorias" className="btn-secondary">
            Cancelar
          </Link>
        )}
      </div>
      {state.error && (
        <p role="alert" className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
