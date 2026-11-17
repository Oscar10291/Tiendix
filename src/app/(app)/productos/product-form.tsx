"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import type { BarcodeValue, ProductFormState, ProductFormValues } from "./actions";

type Props = {
  action: (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  categories: { id: string; path: string }[];
  product?: ProductFormValues;
  /** Valores sugeridos al crear (p. ej. el código escaneado que no existía) */
  defaults?: Partial<ProductFormValues>;
  cancelHref: string;
  /** Nombre de la sucursal activa, si el usuario puede cargar existencia inicial */
  initialStockBranch?: string | null;
};

let rowKey = 0;
type Row = BarcodeValue & { key: number };
const toRows = (list: BarcodeValue[]) => list.map((b) => ({ ...b, key: rowKey++ }));

export function ProductForm({ action, categories, product, defaults, cancelHref, initialStockBranch }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const isEdit = Boolean(product);
  // Tras un error mostramos lo que se había escrito (React vacía el formulario al enviar)
  const v: Partial<ProductFormValues> = state.values ?? product ?? defaults ?? {};
  const err = state.fieldErrors ?? {};

  const [rows, setRows] = useState<Row[]>(() => toRows(v.barcodes?.length ? v.barcodes : [{ code: "", quantity: "1" }]));
  const [lastValues, setLastValues] = useState(state.values);
  if (state.values !== lastValues) {
    // Volvió un error: restaura las filas de códigos que se habían enviado
    setLastValues(state.values);
    if (state.values) setRows(toRows(state.values.barcodes.length ? state.values.barcodes : [{ code: "", quantity: "1" }]));
  }
  const [cost, setCost] = useState(v.cost ?? "");
  const [price, setPrice] = useState(v.price ?? "");
  const [trackStock, setTrackStock] = useState(v.trackStock ?? true);
  const listRef = useRef<HTMLDivElement>(null);

  function addRow(focus = true) {
    setRows((r) => [...r, { code: "", quantity: "1", key: rowKey++ }]);
    if (focus) {
      // Enfoca el campo nuevo cuando ya está en pantalla
      setTimeout(() => {
        const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('input[name="barcodeCode"]');
        inputs?.[inputs.length - 1]?.focus();
      });
    }
  }

  const c = Number(String(cost).replace(",", "."));
  const p = Number(String(price).replace(",", "."));
  const margin = p > 0 && c > 0 ? ((p - c) / p) * 100 : null;

  return (
    <form action={formAction} className="mt-6 max-w-3xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nombre" error={err.name} className="sm:col-span-2">
          <input name="name" required maxLength={120} defaultValue={v.name} autoFocus={!isEdit} className="input mt-1" />
        </Field>
        <Field label="SKU (código interno)" hint={isEdit ? undefined : "Vacío = automático"} error={err.sku}>
          <input name="sku" defaultValue={v.sku} maxLength={40} autoComplete="off" className="input mt-1 uppercase" />
        </Field>
      </div>

      <Field label="Descripción" hint="Opcional" error={err.description}>
        <textarea name="description" rows={2} maxLength={500} defaultValue={v.description} className="input mt-1" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoría" error={err.categoryId}>
          <select name="categoryId" defaultValue={v.categoryId ?? ""} className="input mt-1">
            <option value="">(Sin categoría)</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.path}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unidad de medida" error={err.unit}>
          <select name="unit" defaultValue={v.unit ?? "UNIT"} className="input mt-1">
            {Object.entries(UNIT_LABELS).map(([value, u]) => (
              <option key={value} value={value}>
                {u.label} ({u.short})
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Precios</legend>
        <Field label="Costo" hint="Lo que te cuesta" error={err.cost}>
          <input name="cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" className="input mt-1" />
        </Field>
        <Field label="Precio de venta" hint="Con impuesto" error={err.price}>
          <input name="price" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="input mt-1" />
          {margin !== null && (
            <span className={`mt-1 block text-xs ${margin < 0 ? "text-red-600" : "text-neutral-500"}`}>Margen: {margin.toFixed(1)}%</span>
          )}
        </Field>
        <Field label="Impuesto %" hint="IVA" error={err.taxRate}>
          <input name="taxRate" inputMode="decimal" defaultValue={v.taxRate ?? "12"} className="input mt-1" />
        </Field>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">Códigos de barras</legend>
        <p className="text-xs text-neutral-500">
          Escríbelos a mano o escanéalos. Enter agrega otra fila. &quot;Unidades&quot; es para empaques: un fardo de 12 lleva 12.
        </p>
        <div ref={listRef} className="mt-2 space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex gap-2">
              <input
                name="barcodeCode"
                defaultValue={row.code}
                placeholder="Código de barras"
                autoComplete="off"
                maxLength={64}
                onKeyDown={(e) => {
                  // El lector manda Enter al final: no enviar el formulario, pasar a otra fila
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.currentTarget.value.trim()) addRow();
                  }
                }}
                className="input flex-1 font-mono"
              />
              <label className="flex w-32 items-center gap-1 text-xs text-neutral-500">
                <input name="barcodeQty" defaultValue={row.quantity} inputMode="decimal" className="input w-16" aria-label="Unidades" />
                unid.
              </label>
              <button
                type="button"
                onClick={() => setRows((r) => (r.length > 1 ? r.filter((x) => x.key !== row.key) : [{ code: "", quantity: "1", key: rowKey++ }]))}
                className="btn-secondary px-3"
                aria-label="Quitar código"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => addRow()} className="mt-2 text-sm text-blue-600 hover:underline">
          + Otro código
        </button>
        {err.barcodes && <p className="mt-1 text-sm text-red-600">{err.barcodes}</p>}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Inventario</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="trackStock" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
          Controlar existencias (desmarca para servicios, que no tienen stock)
        </label>
        {trackStock && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stock mínimo" hint="Avisa cuando quede esto o menos" error={err.minStock}>
              <input name="minStock" inputMode="decimal" defaultValue={v.minStock ?? "0"} className="input mt-1" />
            </Field>
            {!isEdit && initialStockBranch && (
              <Field label="Existencia inicial" hint={`En ${initialStockBranch}`} error={err.initialStock}>
                <input name="initialStock" inputMode="decimal" defaultValue={v.initialStock} placeholder="0" className="input mt-1" />
              </Field>
            )}
          </div>
        )}
        {!trackStock && <input type="hidden" name="minStock" value="0" />}
      </fieldset>

      {isEdit && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={v.active ?? true} />
          Producto activo (se puede vender y mover)
        </label>
      )}

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear producto"}
        </button>
        <Link href={cancelHref} className="btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-2 text-xs text-neutral-500">{hint}</span>}
      {children}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}
