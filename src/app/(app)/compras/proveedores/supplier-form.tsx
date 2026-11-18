"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { SupplierFormState, SupplierFormValues } from "./actions";

type Props = {
  action: (prev: SupplierFormState, formData: FormData) => Promise<SupplierFormState>;
  supplier?: SupplierFormValues;
  cancelHref: string;
};

export function SupplierForm({ action, supplier, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? supplier;

  return (
    <form action={formAction} className="mt-6 max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Nombre o razón social</span>
          <input name="name" required maxLength={100} defaultValue={v?.name} autoFocus className="input mt-1" placeholder="Ej.: Distribuidora La Económica" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">NIT</span>
          <span className="ml-2 text-xs text-neutral-500">Opcional</span>
          <input name="taxId" maxLength={20} defaultValue={v?.taxId} className="input mt-1" placeholder="1234567-8" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Persona de contacto</span>
          <span className="ml-2 text-xs text-neutral-500">Opcional</span>
          <input name="contactName" maxLength={80} defaultValue={v?.contactName} className="input mt-1" placeholder="Ej.: Ana López (vendedora)" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Teléfono</span>
          <span className="ml-2 text-xs text-neutral-500">Opcional</span>
          <input name="phone" type="tel" maxLength={40} defaultValue={v?.phone} className="input mt-1" placeholder="5555-1234" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Correo</span>
          <span className="ml-2 text-xs text-neutral-500">Opcional</span>
          <input name="email" type="email" maxLength={120} defaultValue={v?.email} className="input mt-1" placeholder="ventas@proveedor.com" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Dirección</span>
          <span className="ml-2 text-xs text-neutral-500">Opcional</span>
          <input name="address" maxLength={200} defaultValue={v?.address} className="input mt-1" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Notas</span>
          <span className="ml-2 text-xs text-neutral-500">Opcional</span>
          <textarea
            name="notes"
            maxLength={500}
            rows={3}
            defaultValue={v?.notes}
            className="input mt-1"
            placeholder="Ej.: crédito a 30 días, visita los martes, pedido mínimo Q500…"
          />
        </label>
      </div>
      {supplier && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={v?.active ?? true} />
          Activo (se puede elegir en órdenes de compra nuevas)
        </label>
      )}
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Guardando…" : supplier ? "Guardar cambios" : "Crear proveedor"}
        </button>
        <Link href={cancelHref} className="btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
