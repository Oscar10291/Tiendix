"use client";

import { switchBranch } from "@/lib/auth/actions";

type Props = { current: string | null; branches: { id: string; name: string }[] };

/** Selector de la sucursal en la que se está trabajando. */
export function BranchSwitcher({ current, branches }: Props) {
  if (branches.length === 0) {
    return <span className="text-xs text-amber-600">Sin sucursal asignada</span>;
  }
  if (branches.length === 1) {
    return <span className="text-neutral-600 dark:text-neutral-400">{branches[0].name}</span>;
  }
  return (
    <form action={switchBranch}>
      <label className="sr-only" htmlFor="branchId">
        Sucursal
      </label>
      <select
        id="branchId"
        name="branchId"
        defaultValue={current ?? ""}
        key={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input py-1.5"
      >
        {!current && <option value="">Elige sucursal…</option>}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </form>
  );
}
