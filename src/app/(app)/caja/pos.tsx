"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ScanInput } from "@/components/scan-input";
import { printTicket } from "@/components/print-ticket";
import { centsToDecimal, computeSale, milliToDecimal, parseMoney, parsePercent, parseQuantity, percentOf } from "@/lib/pos/money";
import { chargeSale, posLookup, type ChargeResult, type PosProduct } from "./actions";

type DiscMode = "Q" | "%";
type Line = { key: string; product: PosProduct; quantity: string; discMode: DiscMode; discValue: string };
type Done = Extract<ChargeResult, { ok: true }>;

const moneyFmt = new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" });
const qtyFmt = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 3 });
/** Centavos → "Q12.50" */
const q = (cents: number) => moneyFmt.format(cents / 100);

/** Id aleatorio para la venta (funciona también si la página no se abre con https). */
function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Descuento escrito (en Q o %) convertido a centavos. null si no es válido. */
function discountCents(mode: DiscMode, value: string, base: number) {
  if (value.trim() === "") return 0;
  if (mode === "Q") return parseMoney(value);
  const pct = parsePercent(value);
  return pct === null ? null : percentOf(base, pct);
}

const AUTO_PRINT_KEY = "tiendix:auto-print";

export function Pos() {
  const [lines, setLines] = useState<Line[]>([]);
  const [lastProduct, setLastProduct] = useState<string | null>(null);
  const [saleDiscMode, setSaleDiscMode] = useState<DiscMode>("Q");
  const [saleDiscValue, setSaleDiscValue] = useState("");
  const [clientId, setClientId] = useState(newId);

  const [matches, setMatches] = useState<PosProduct[]>([]);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  const [paying, setPaying] = useState(false);
  const [tendered, setTendered] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [charging, startCharge] = useTransition();
  const [done, setDone] = useState<Done | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);
  const tenderedRef = useRef<HTMLInputElement>(null);
  const newSaleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      setAutoPrint(localStorage.getItem(AUTO_PRINT_KEY) === "1");
    } catch {}
  }, []);

  const focusScan = useCallback(() => {
    if (scanRef.current) scanRef.current.value = "";
    scanRef.current?.focus();
  }, []);

  // ── Cálculos (los mismos que hace el servidor al cobrar) ──
  const calc = useMemo(() => {
    const problems: string[] = [];
    const rows = lines.map((l) => {
      const quantity = parseQuantity(l.quantity);
      const unitPrice = parseMoney(l.product.price) ?? 0;
      const gross = quantity ? Math.round((quantity * unitPrice) / 1000 + Number.EPSILON) : 0;
      const discount = discountCents(l.discMode, l.discValue, gross);
      const overStock = l.product.stock !== null && quantity !== null && quantity > (parseQuantity(l.product.stock) ?? 0);
      if (quantity === null || quantity === 0) problems.push(`Revisa la cantidad de "${l.product.name}".`);
      if (discount === null || (discount ?? 0) > gross) problems.push(`Revisa el descuento de "${l.product.name}".`);
      if (overStock) problems.push(`No hay suficiente "${l.product.name}": hay ${qtyFmt.format(Number(l.product.stock))} ${l.product.unit}.`);
      return { quantity: quantity ?? 0, unitPrice, discount: discount ?? 0, taxRate: Number(l.product.taxRate), overStock, badQty: !quantity, badDisc: discount === null || (discount ?? 0) > gross };
    });
    const pre = computeSale(rows, 0);
    const saleDisc = discountCents(saleDiscMode, saleDiscValue, pre.subtotal);
    if (saleDisc === null || saleDisc > pre.subtotal) problems.push("Revisa el descuento de la venta.");
    const totals = computeSale(rows, saleDisc ?? 0);
    return { rows, totals, saleDisc: saleDisc ?? 0, problems: [...new Set(problems)] };
  }, [lines, saleDiscMode, saleDiscValue]);

  const { totals } = calc;
  const canCharge = lines.length > 0 && calc.problems.length === 0 && !done;
  const tenderedCents = parseMoney(tendered);
  const change = tenderedCents !== null ? tenderedCents - totals.total : null;

  // ── Carrito ──
  function add(p: PosProduct) {
    setMatches([]);
    setLookupMsg(null);
    const addMilli = parseQuantity(p.scannedQty ?? "1") ?? 1000;
    const key = newId();
    setLastProduct(p.id);
    setLines((current) => {
      const existing = current.find((l) => l.product.id === p.id);
      if (existing) {
        const now = parseQuantity(existing.quantity) ?? 0;
        // Actualiza también la existencia por si cambió
        return current.map((l) => (l === existing ? { ...l, product: { ...l.product, stock: p.stock }, quantity: milliToDecimal(now + addMilli) } : l));
      }
      return [...current, { key, product: p, quantity: milliToDecimal(addMilli), discMode: "Q", discValue: "" }];
    });
    focusScan();
  }

  function search(text: string) {
    if (done) newSale();
    startSearch(async () => {
      const r = await posLookup(text);
      if (r.exact) add(r.exact);
      else {
        setMatches(r.matches);
        setLookupMsg(r.message ?? null);
      }
    });
  }

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => {
    setLines((ls) => ls.filter((l) => l.key !== key));
    focusScan();
  };
  function step(l: Line, delta: number) {
    const now = parseQuantity(l.quantity) ?? 0;
    const next = Math.max(now + delta * 1000, 0);
    if (next === 0) remove(l.key);
    else update(l.key, { quantity: milliToDecimal(next) });
  }

  // ── Cobro ──
  function openPay() {
    if (!canCharge) return;
    setPayError(null);
    setTendered("");
    setPaying(true);
  }
  useEffect(() => {
    if (paying) tenderedRef.current?.focus();
  }, [paying]);

  function confirmPay(e?: React.FormEvent) {
    e?.preventDefault();
    if (tenderedCents === null || tenderedCents < totals.total) {
      setPayError(tenderedCents === null ? "Escribe cuánto entregó el cliente." : `Faltan ${q(totals.total - tenderedCents)}.`);
      return;
    }
    startCharge(async () => {
      const r = await chargeSale({
        clientId,
        items: lines.map((l, i) => ({ productId: l.product.id, quantity: milliToDecimal(calc.rows[i].quantity), discount: centsToDecimal(totals.lines[i].discount) })),
        saleDiscount: centsToDecimal(calc.saleDisc),
        tendered: centsToDecimal(tenderedCents),
      });
      if (!r.ok) {
        setPayError(r.error);
        return;
      }
      setPaying(false);
      setDone(r);
      if (autoPrint) printTicket(r.saleId);
    });
  }

  function newSale() {
    setLines([]);
    setSaleDiscValue("");
    setSaleDiscMode("Q");
    setClientId(newId());
    setDone(null);
    setPaying(false);
    setTendered("");
    setMatches([]);
    setLookupMsg(null);
    focusScan();
  }

  useEffect(() => {
    if (done) newSaleRef.current?.focus();
  }, [done]);

  // Atajos: F12 cobrar, Esc cerrar el cobro
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F12") {
        e.preventDefault();
        if (!paying && !done) openPay();
      } else if (e.key === "Escape" && paying && !charging) {
        setPaying(false);
        focusScan();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Billetes sugeridos para cobrar rápido: exacto y los siguientes montos redondos
  const suggestions = useMemo(() => {
    const t = totals.total;
    const set = new Set<number>([t]);
    for (const step of [500, 1000, 2000, 5000, 10000, 20000]) {
      const up = Math.ceil(t / step) * step;
      if (up > t) set.add(up);
    }
    return [...set].sort((a, b) => a - b).slice(0, 5);
  }, [totals.total]);

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_22rem]">
      {/* Columna izquierda: búsqueda y carrito */}
      <section>
        <div className="flex gap-2">
          <ScanInput inputRef={scanRef} onScan={search} className="flex-1" />
          <button type="button" className="btn-secondary" disabled={searching} onClick={() => scanRef.current?.value && search(scanRef.current.value)}>
            {searching ? "Buscando…" : "Buscar"}
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Escanea o escribe y presiona Enter. Escanear otra vez el mismo producto suma 1. Atajos: F2 buscar · F12 cobrar.</p>

        {lookupMsg && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{lookupMsg}</p>}
        {matches.length > 0 && (
          <ul className="mt-2 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => add(m)} className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <span>
                    {m.name} <span className="text-xs text-neutral-500">{m.sku}</span>
                  </span>
                  <span className="text-right">
                    <span className="font-medium">{moneyFmt.format(Number(m.price))}</span>
                    <span className="block text-xs text-neutral-500">{m.stock === null ? "servicio" : `${qtyFmt.format(Number(m.stock))} ${m.unit} en existencia`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-center font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">Precio</th>
                <th className="px-3 py-2 font-medium">Descuento</th>
                <th className="px-3 py-2 text-right font-medium">Importe</th>
                <th className="px-1 py-2">
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {lines.map((l, i) => {
                const row = calc.rows[i];
                const line = totals.lines[i];
                return (
                  <tr key={l.key} className={l.product.id === lastProduct ? "bg-blue-50/60 dark:bg-blue-950/40" : undefined}>
                    <td className="px-3 py-2">
                      <span className="block font-medium">{l.product.name}</span>
                      <span className={`block text-xs ${row.overStock ? "font-medium text-red-600" : "text-neutral-500"}`}>
                        {l.product.sku}
                        {l.product.stock !== null && ` · hay ${qtyFmt.format(Number(l.product.stock))} ${l.product.unit}`}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => step(l, -1)} className="btn-secondary h-8 w-8 p-0" aria-label="Uno menos">
                          −
                        </button>
                        <input
                          value={l.quantity}
                          onChange={(e) => update(l.key, { quantity: e.target.value })}
                          onFocus={(e) => e.currentTarget.select()}
                          inputMode="decimal"
                          aria-label={`Cantidad de ${l.product.name}`}
                          className={`input w-20 px-2 py-1 text-center ${row.badQty || row.overStock ? "border-red-500" : ""}`}
                        />
                        <button type="button" onClick={() => step(l, 1)} className="btn-secondary h-8 w-8 p-0" aria-label="Uno más">
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{moneyFmt.format(Number(l.product.price))}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          value={l.discValue}
                          onChange={(e) => update(l.key, { discValue: e.target.value })}
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={`Descuento de ${l.product.name}`}
                          className={`input w-20 px-2 py-1 text-right ${row.badDisc ? "border-red-500" : ""}`}
                        />
                        <ModeToggle mode={l.discMode} onChange={(m) => update(l.key, { discMode: m })} />
                      </div>
                      {line && line.discount > 0 && l.discMode === "%" && <span className="text-xs text-neutral-500">−{q(line.discount)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {line && line.discount > 0 && <span className="block text-xs text-neutral-400 line-through">{q(line.gross)}</span>}
                      {q(line?.total ?? 0)}
                    </td>
                    <td className="px-1 py-2">
                      <button type="button" onClick={() => remove(l.key)} className="rounded px-2 py-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" aria-label={`Quitar ${l.product.name}`}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-neutral-500">
                    {done ? "Venta cobrada. Escanea el siguiente producto para empezar otra." : "El carrito está vacío. Escanea un producto para empezar."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Columna derecha: totales y cobro */}
      <aside className="space-y-4">
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Artículos</dt>
              <dd>{qtyFmt.format(calc.rows.reduce((s, r) => s + r.quantity, 0) / 1000)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Subtotal</dt>
              <dd>{q(totals.subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-neutral-500">Descuento a la venta</dt>
              <dd className="flex items-center gap-1">
                <input
                  value={saleDiscValue}
                  onChange={(e) => setSaleDiscValue(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Descuento a toda la venta"
                  disabled={!!done}
                  className="input w-20 px-2 py-1 text-right"
                />
                <ModeToggle mode={saleDiscMode} onChange={setSaleDiscMode} />
              </dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-green-700 dark:text-green-400">
                <dt>Descuento</dt>
                <dd>−{q(totals.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-xs text-neutral-500">
              <dt>IVA incluido</dt>
              <dd>{q(totals.tax)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-3xl font-bold tabular-nums">{q(totals.total)}</span>
          </div>

          {calc.problems.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-red-600">
              {calc.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          {!paying && !done && (
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={openPay} disabled={!canCharge} className="btn-primary flex-1 py-3 text-base">
                Cobrar (F12)
              </button>
              {lines.length > 0 && (
                <button type="button" onClick={newSale} className="btn-secondary" title="Vaciar el carrito">
                  Vaciar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Panel de cobro en efectivo */}
        {paying && (
          <form onSubmit={confirmPay} className="rounded-lg border-2 border-blue-500 p-4">
            <h2 className="font-semibold">Cobro en efectivo</h2>
            <label className="mt-3 block">
              <span className="text-sm">Recibido</span>
              <input
                ref={tenderedRef}
                value={tendered}
                onChange={(e) => {
                  setTendered(e.target.value);
                  setPayError(null);
                }}
                inputMode="decimal"
                placeholder={centsToDecimal(totals.total)}
                className="input mt-1 text-2xl tabular-nums"
                aria-label="Efectivo recibido"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button key={s} type="button" onClick={() => setTendered(centsToDecimal(s))} className="btn-secondary px-3 py-1">
                  {i === 0 ? "Exacto" : q(s)}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-lg">Cambio</span>
              <span className={`text-3xl font-bold tabular-nums ${change !== null && change < 0 ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>
                {change === null ? "—" : change < 0 ? `Faltan ${q(-change)}` : q(change)}
              </span>
            </div>
            {payError && (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {payError}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={charging} className="btn-primary flex-1 py-3 text-base">
                {charging ? "Cobrando…" : "Confirmar (Enter)"}
              </button>
              <button
                type="button"
                disabled={charging}
                onClick={() => {
                  setPaying(false);
                  focusScan();
                }}
                className="btn-secondary"
              >
                Volver (Esc)
              </button>
            </div>
          </form>
        )}

        {/* Venta cobrada */}
        {done && (
          <div className="rounded-lg border-2 border-green-500 bg-green-50 p-4 dark:bg-green-950">
            <p className="font-semibold text-green-800 dark:text-green-300">Venta #{done.number} cobrada ✓</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Total</dt>
                <dd>{moneyFmt.format(Number(done.total))}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Recibido</dt>
                <dd>{moneyFmt.format(Number(done.tendered))}</dd>
              </div>
            </dl>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg">Cambio</span>
              <span className="text-4xl font-bold tabular-nums">{moneyFmt.format(Number(done.change))}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button ref={newSaleRef} type="button" onClick={newSale} className="btn-primary flex-1 py-3 text-base">
                Nueva venta (Enter)
              </button>
              <button type="button" onClick={() => printTicket(done.saleId)} className="btn-secondary">
                Imprimir ticket
              </button>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          <input
            type="checkbox"
            checked={autoPrint}
            onChange={(e) => {
              setAutoPrint(e.target.checked);
              try {
                localStorage.setItem(AUTO_PRINT_KEY, e.target.checked ? "1" : "0");
              } catch {}
            }}
          />
          Imprimir el ticket automáticamente al cobrar
        </label>
      </aside>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: DiscMode; onChange: (m: DiscMode) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(mode === "Q" ? "%" : "Q")}
      className="btn-secondary h-8 w-9 shrink-0 p-0 text-xs"
      title={mode === "Q" ? "Descuento en quetzales (clic para cambiar a %)" : "Descuento en porcentaje (clic para cambiar a Q)"}
    >
      {mode}
    </button>
  );
}
