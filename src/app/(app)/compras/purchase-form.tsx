"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import { ScanInput } from "@/components/scan-input";
import { parseMoney, parseQuantity } from "@/lib/pos/money";
import { computePurchase } from "@/lib/purchases/calc";
import { lookupPurchaseProducts, lowStockSuggestions, type PurchaseFormState, type PurchaseProductOption } from "./actions";

const qtyFmt = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" });
const n = (v: string) => qtyFmt.format(Number(v));
const cents = (c: number) => moneyFmt.format(c / 100);

export type PurchaseLine = { product: PurchaseProductOption; quantity: string; unitCost: string };

export type PurchaseFormInitial = {
  supplierId: string;
  invoiceNumber: string;
  expectedAt: string;
  note: string;
  lines: PurchaseLine[];
};

type Props = {
  action: (prev: PurchaseFormState, formData: FormData) => Promise<PurchaseFormState>;
  suppliers: { id: string; name: string }[];
  initial: PurchaseFormInitial;
  branchName: string;
  /** Estado actual al editar (null = orden nueva) */
  status: "DRAFT" | "ORDERED" | null;
  cancelHref: string;
};

export function PurchaseForm({ action, suppliers, initial, branchName, status, cancelHref }: Props) {
  const [state, formAction, saving] = useActionState(action, {});
  const [searching, startSearch] = useTransition();

  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [invoiceNumber, setInvoiceNumber] = useState(initial.invoiceNumber);
  const [expectedAt, setExpectedAt] = useState(initial.expectedAt);
  const [note, setNote] = useState(initial.note);
  const [lines, setLines] = useState<PurchaseLine[]>(initial.lines);
  const [matches, setMatches] = useState<PurchaseProductOption[]>([]);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);

  /** Agrega el producto; si ya está en la orden, suma la cantidad. */
  function add(p: PurchaseProductOption) {
    const step = p.scannedQty ?? "1";
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === p.id);
      if (i === -1) return [...ls, { product: p, quantity: step, unitCost: Number(p.cost) > 0 ? p.cost : "" }];
      const current = parseQuantity(ls[i].quantity) ?? 0;
      const sum = (current + (parseQuantity(step) ?? 1000)) / 1000;
      return ls.map((l, j) => (j === i ? { ...l, quantity: String(sum) } : l));
    });
    setFlashId(p.id);
    setMatches([]);
    setLookupMsg(null);
    if (scanRef.current) scanRef.current.value = "";
    scanRef.current?.focus();
  }

  function search(text: string) {
    startSearch(async () => {
      const r = await lookupPurchaseProducts(text);
      if (r.exact) add(r.exact);
      else {
        setMatches(r.matches);
        setLookupMsg(r.message ?? null);
      }
    });
  }

  function addLowStock() {
    startSearch(async () => {
      const list = await lowStockSuggestions();
      const fresh = list.filter((p) => !lines.some((l) => l.product.id === p.id));
      if (fresh.length === 0) {
        setLookupMsg(list.length === 0 ? `No hay productos con stock bajo en ${branchName}.` : "Los productos con stock bajo ya están en la orden.");
        return;
      }
      setLookupMsg(`${fresh.length === 1 ? "Se agregó 1 producto" : `Se agregaron ${fresh.length} productos`} con stock bajo. Revisa las cantidades.`);
      setLines((ls) => [
        ...ls,
        ...fresh.map((p) => {
          // Propone comprar lo necesario para llegar al doble del mínimo
          const need = Math.max(Number(p.minStock) * 2 - Number(p.stock), 1);
          return { product: p, quantity: String(Math.ceil(need)), unitCost: Number(p.cost) > 0 ? p.cost : "" };
        }),
      ]);
    });
  }

  const update = (i: number, patch: Partial<PurchaseLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));

  const parsed = lines.map((l) => ({ quantity: parseQuantity(l.quantity), unitCost: parseMoney(l.unitCost) }));
  const totals = computePurchase(parsed.map((p) => ({ quantity: p.quantity ?? 0, unitCost: p.unitCost ?? 0 })));
  const invalid = parsed.some((p) => p.quantity === null || p.quantity <= 0 || p.unitCost === null);

  function submit(intent: "draft" | "order") {
    const fd = new FormData();
    fd.set("supplierId", supplierId);
    fd.set("invoiceNumber", invoiceNumber);
    fd.set("expectedAt", expectedAt);
    fd.set("note", note);
    fd.set("intent", intent);
    fd.set("items", JSON.stringify(lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitCost: l.unitCost }))));
    startTransition(() => formAction(fd));
  }

  return (
    <form
      className="mt-6 space-y-6"
      // Enter en una cantidad no guarda la orden: se guarda solo con los botones
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Proveedor</span>
          <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input mt-1">
            <option value="">Elige un proveedor…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {suppliers.length === 0 && (
            <span className="mt-1 block text-xs text-amber-700">
              No hay proveedores activos.{" "}
              <Link href="/compras/proveedores/nuevo" className="underline">
                Crea uno primero
              </Link>
              .
            </span>
          )}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Entrega esperada</span>
          <span className="ml-2 text-xs text-neutral-500">Opcional</span>
          <input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Nº de factura</span>
          <span className="ml-2 text-xs text-neutral-500">Opcional</span>
          <input value={invoiceNumber} maxLength={40} onChange={(e) => setInvoiceNumber(e.target.value)} className="input mt-1" placeholder="Se puede poner al recibir" />
        </label>
        <label className="block sm:col-span-2 lg:col-span-4">
          <span className="text-sm font-medium">Nota</span>
          <span className="ml-2 text-xs text-neutral-500">Opcional</span>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="input mt-1" placeholder="Ej.: pedido por WhatsApp, pago contra entrega…" />
        </label>
      </div>

      <section>
        <h2 className="text-sm font-medium">Productos</h2>
        <div className="mt-1 flex flex-wrap gap-2">
          <ScanInput inputRef={scanRef} onScan={search} autoFocus={false} className="min-w-64 flex-1" />
          <button type="button" className="btn-secondary" disabled={searching} onClick={() => scanRef.current?.value && search(scanRef.current.value)}>
            {searching ? "Buscando…" : "Agregar"}
          </button>
          {status === null && (
            <button type="button" className="btn-secondary" disabled={searching} onClick={addLowStock} title={`Productos en o bajo su mínimo en ${branchName}`}>
              + Stock bajo
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-500">Escanea o escribe y presiona Enter. Si el producto ya está en la orden, se suma la cantidad.</p>
        {lookupMsg && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{lookupMsg}</p>}
        {matches.length > 0 && (
          <ul className="mt-2 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => add(m)} className="flex w-full justify-between gap-4 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <span>
                    {m.name} <span className="text-xs text-neutral-500">{m.sku}</span>
                  </span>
                  <span className="text-neutral-500">
                    hay {n(m.stock)} {m.unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Existencia</th>
                <th className="px-3 py-2 font-medium">Cantidad</th>
                <th className="px-3 py-2 font-medium">Costo unitario</th>
                <th className="px-3 py-2 text-right font-medium">Importe</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {lines.map((l, i) => {
                const badQty = parsed[i].quantity === null || parsed[i].quantity! <= 0;
                const badCost = parsed[i].unitCost === null;
                const prevCost = Number(l.product.cost);
                const newCost = (parsed[i].unitCost ?? 0) / 100;
                return (
                  <tr key={l.product.id} className={flashId === l.product.id ? "bg-green-50 dark:bg-green-950" : ""}>
                    <td className="px-3 py-2">
                      {l.product.name}
                      <span className="block text-xs text-neutral-500">{l.product.sku}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-neutral-500">
                      {n(l.product.stock)} {l.product.unit}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        <input
                          aria-label={`Cantidad de ${l.product.name}`}
                          inputMode="decimal"
                          value={l.quantity}
                          onChange={(e) => update(i, { quantity: e.target.value })}
                          className={`input w-24 py-1 ${badQty ? "border-red-500" : ""}`}
                        />
                        <span className="text-xs text-neutral-500">{l.product.unit}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Costo de ${l.product.name}`}
                        inputMode="decimal"
                        value={l.unitCost}
                        placeholder="0.00"
                        onChange={(e) => update(i, { unitCost: e.target.value })}
                        className={`input w-28 py-1 ${badCost ? "border-red-500" : ""}`}
                      />
                      {!badCost && prevCost > 0 && Math.abs(newCost - prevCost) >= 0.005 && (
                        <span className={`block text-xs ${newCost > prevCost ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>
                          {newCost > prevCost ? "▲" : "▼"} antes {moneyFmt.format(prevCost)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{cents(totals.lines[i])}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => remove(i)} className="text-red-600 hover:underline" aria-label={`Quitar ${l.product.name}`}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                    Todavía no hay productos en la orden.
                  </td>
                </tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral-200 font-semibold dark:border-neutral-800">
                  <td className="px-3 py-2" colSpan={4}>
                    Total ({lines.length} {lines.length === 1 ? "producto" : "productos"})
                  </td>
                  <td className="px-3 py-2 text-right text-base">{cents(totals.total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-1 text-xs text-neutral-500">El costo es por unidad, tal como lo cobra el proveedor. Al recibir, se recalcula el costo promedio de cada producto.</p>
      </section>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {status !== "ORDERED" && (
          <button type="button" onClick={() => submit("draft")} disabled={saving || invalid || lines.length === 0 || !supplierId} className="btn-secondary">
            {saving ? "Guardando…" : "Guardar borrador"}
          </button>
        )}
        <button type="button" onClick={() => submit("order")} disabled={saving || invalid || lines.length === 0 || !supplierId} className="btn-primary">
          {saving ? "Guardando…" : status === "ORDERED" ? "Guardar cambios" : "Guardar y marcar como enviada"}
        </button>
        <Link href={cancelHref} className="btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
