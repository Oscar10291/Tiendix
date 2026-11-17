"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ScanInput } from "@/components/scan-input";
import { MANUAL_KINDS, REASONS, type ManualKind } from "@/lib/inventory/reasons";
import { lookupProducts, registerMovement, type MovementState, type ProductOption } from "../actions";

const fmt = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 3 });
const n = (v: string) => fmt.format(Number(v));

type Saved = NonNullable<MovementState["saved"]>;

export function MovementForm({ initialProduct, branchName }: { initialProduct: ProductOption | null; branchName: string }) {
  const [state, formAction, saving] = useActionState(registerMovement, {});
  const [searching, startSearch] = useTransition();

  const [product, setProduct] = useState<ProductOption | null>(initialProduct);
  const [matches, setMatches] = useState<ProductOption[]>([]);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<ManualKind>("IN");
  const [reason, setReason] = useState<string>(REASONS.IN[0].value);
  const [quantity, setQuantity] = useState(initialProduct ? "1" : "");
  const [history, setHistory] = useState<Saved[]>([]);

  const scanRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  // Al elegir producto, el cursor pasa a la cantidad
  useEffect(() => {
    if (product) qtyRef.current?.select();
  }, [product]);

  // Movimiento guardado: lo agrega a la lista, limpia y vuelve al campo de escaneo
  const [lastSaved, setLastSaved] = useState<Saved | undefined>();
  if (state.saved && state.saved !== lastSaved) {
    setLastSaved(state.saved);
    setHistory((h) => [state.saved!, ...h].slice(0, 20));
    setProduct(null);
    setQuantity("");
    setMatches([]);
    setLookupMsg(null);
  }
  useEffect(() => {
    if (state.saved) {
      if (scanRef.current) scanRef.current.value = "";
      scanRef.current?.focus();
    }
  }, [state.saved]);

  function choose(p: ProductOption) {
    setProduct(p);
    setMatches([]);
    setLookupMsg(null);
    // Si se escaneó el código de un fardo, propone esa cantidad
    setQuantity(kind === "ADJUST" ? p.stock : (p.scannedQty ?? "1"));
    if (scanRef.current) scanRef.current.value = "";
  }

  function search(text: string) {
    startSearch(async () => {
      const r = await lookupProducts(text);
      if (r.exact) choose(r.exact);
      else {
        setMatches(r.matches);
        setLookupMsg(r.message ?? null);
      }
    });
  }

  function changeKind(k: ManualKind) {
    setKind(k);
    setReason(REASONS[k][0].value);
    if (product && k === "ADJUST") setQuantity(product.stock);
    if (product && k !== "ADJUST" && kind === "ADJUST") setQuantity("1");
  }

  const preview = (() => {
    if (!product) return null;
    const q = Number(quantity.replace(",", "."));
    if (!quantity || Number.isNaN(q)) return null;
    const current = Number(product.stock);
    const after = kind === "IN" ? current + q : kind === "OUT" ? current - q : q;
    return { after, diff: after - current };
  })();

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        <label className="block text-sm font-medium">
          1. Producto
        </label>
        <div className="mt-1 flex gap-2">
          <ScanInput inputRef={scanRef} onScan={search} autoFocus={!initialProduct} className="flex-1" />
          <button type="button" className="btn-secondary" disabled={searching} onClick={() => scanRef.current?.value && search(scanRef.current.value)}>
            {searching ? "Buscando…" : "Buscar"}
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Con lector: apunta y dispara. Sin lector: escribe el código o el nombre y presiona Enter.</p>

        {lookupMsg && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{lookupMsg}</p>}
        {matches.length > 0 && (
          <ul className="mt-2 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => choose(m)} className="flex w-full justify-between gap-4 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <span>
                    {m.name} <span className="text-xs text-neutral-500">{m.sku}</span>
                  </span>
                  <span className="text-neutral-500">
                    {n(m.stock)} {m.unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {product && (
          <form action={formAction} className="mt-4 space-y-4 rounded-lg border border-blue-500 p-4">
            <input type="hidden" name="productId" value={product.id} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{product.name}</p>
                <p className="text-xs text-neutral-500">SKU {product.sku}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-neutral-500">Existencia en {branchName}</p>
                <p className="text-lg font-semibold">
                  {n(product.stock)} {product.unit}
                </p>
              </div>
            </div>
            {product.scannedQty && product.scannedQty !== "1" && (
              <p className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                Escaneaste un código de empaque: equivale a {n(product.scannedQty)} {product.unit}.
              </p>
            )}

            <fieldset>
              <legend className="text-sm font-medium">2. Tipo de movimiento</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {MANUAL_KINDS.map((k) => (
                  <label key={k.value} className="flex cursor-pointer flex-col rounded-md border border-neutral-200 p-2 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:border-neutral-800 dark:has-[:checked]:bg-blue-950">
                    <span className="flex items-center gap-2 font-medium">
                      <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => changeKind(k.value)} />
                      {k.label}
                    </span>
                    <span className="text-xs text-neutral-500">{k.help}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">{kind === "ADJUST" ? "3. Cantidad contada (lo que hay en realidad)" : "3. Cantidad"}</span>
                <input
                  ref={qtyRef}
                  name="quantity"
                  required
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="input mt-1 text-lg"
                />
                {preview && (
                  <span className={`mt-1 block text-xs ${preview.after < 0 ? "text-red-600" : "text-neutral-500"}`}>
                    Quedarán {fmt.format(preview.after)} {product.unit}
                    {kind === "ADJUST" && ` (${preview.diff >= 0 ? "+" : ""}${fmt.format(preview.diff)})`}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-sm font-medium">4. Motivo</span>
                <select name="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-1">
                  {REASONS[kind].map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              {kind === "IN" && (
                <label className="block">
                  <span className="text-sm font-medium">Costo unitario</span>
                  <span className="ml-2 text-xs text-neutral-500">Opcional</span>
                  <input name="unitCost" inputMode="decimal" key={product.id} defaultValue={product.cost} className="input mt-1" />
                  {reason === "COMPRA_DIRECTA" && <span className="mt-1 block text-xs text-neutral-500">Si cambia, se actualiza el costo del producto.</span>}
                </label>
              )}
              <label className={`block ${kind === "IN" ? "" : "sm:col-span-2"}`}>
                <span className="text-sm font-medium">Nota</span>
                <span className="ml-2 text-xs text-neutral-500">{reason === "OTRO" ? "Obligatoria" : "Opcional"}</span>
                <input name="note" maxLength={200} required={reason === "OTRO"} className="input mt-1" placeholder="Ej.: factura 1234, se rompió al descargar…" />
              </label>
            </div>

            {state.error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {state.error}
              </p>
            )}

            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Guardando…" : "Guardar movimiento"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setProduct(null);
                  scanRef.current?.focus();
                }}
              >
                Cambiar producto
              </button>
            </div>
          </form>
        )}
      </div>

      <aside>
        <h2 className="text-sm font-semibold">Registrados ahora</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Aquí verás los movimientos que guardes en esta pantalla.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {history.map((h, i) => (
              <li
                key={h.id}
                className={`rounded-md border p-2 text-sm ${i === 0 ? "border-green-500 bg-green-50 dark:bg-green-950" : "border-neutral-200 dark:border-neutral-800"}`}
              >
                <span className="block font-medium">{h.productName}</span>
                <span className={h.text.startsWith("−") ? "text-red-600" : "text-green-700 dark:text-green-400"}>{h.text}</span>
                <span className="text-neutral-500">
                  {" "}
                  · quedan {h.balance} {h.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/inventario/kardex" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Ver kárdex →
        </Link>
      </aside>
    </div>
  );
}
