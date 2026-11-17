"use client";

import { useActionState, useState } from "react";
import { countDenominations, DENOMINATIONS, parseMoney } from "@/lib/pos/money";
import { closeCashSession } from "../../../actions";

const moneyFmt = new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" });
const q = (cents: number) => moneyFmt.format(cents / 100);

type Summary = { opening: string; cashSales: string; expected: string; salesCount: number; cancelledCount: number };

export function CloseCashForm({ cashSessionId, summary }: { cashSessionId: string; summary: Summary }) {
  const [state, action, pending] = useActionState(closeCashSession, {});
  const [counts, setCounts] = useState<Record<string, string>>({});

  const numeric = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, /^\d+$/.test(v) ? Number(v) : 0]));
  const counted = countDenominations(numeric);
  const expected = parseMoney(summary.expected) ?? 0;
  const diff = counted - expected;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (counted === 0 && expected > 0 && !confirm("No contaste nada de efectivo. ¿Cerrar la caja con Q0.00?")) e.preventDefault();
      }}
      className="mt-6 grid gap-6 sm:grid-cols-[1fr_16rem]"
    >
      <input type="hidden" name="cashSessionId" value={cashSessionId} />
      <div>
        {(["billete", "moneda"] as const).map((kind) => (
          <fieldset key={kind} className="mb-4">
            <legend className="text-sm font-medium">{kind === "billete" ? "Billetes" : "Monedas"}</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
                const n = numeric[d.value] ?? 0;
                return (
                  <label key={d.value} className="flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
                    <span className="w-12 shrink-0 text-sm font-medium whitespace-nowrap">{d.label}</span>
                    <span className="text-neutral-400">×</span>
                    <input
                      name={`d_${d.value}`}
                      inputMode="numeric"
                      pattern="\d*"
                      placeholder="0"
                      value={counts[d.value] ?? ""}
                      onChange={(e) => setCounts((c) => ({ ...c, [d.value]: e.target.value.replace(/\D/g, "") }))}
                      className="input w-20 px-2 py-1 text-right"
                      aria-label={`Cantidad de ${d.label}`}
                    />
                    {n > 0 && <span className="ml-auto text-xs whitespace-nowrap text-neutral-500">{q(n * d.cents)}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <label className="block">
          <span className="text-sm font-medium">Nota del cierre</span>
          <span className="ml-2 text-xs text-neutral-500">{diff !== 0 ? "Recomendada: explica la diferencia" : "Opcional"}</span>
          <input name="note" maxLength={300} className="input mt-1" />
        </label>
      </div>

      <aside className="h-fit rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">Fondo inicial</dt>
            <dd>{moneyFmt.format(Number(summary.opening))}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Ventas en efectivo ({summary.salesCount})</dt>
            <dd>{moneyFmt.format(Number(summary.cashSales))}</dd>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium dark:border-neutral-800">
            <dt>Debería haber</dt>
            <dd>{q(expected)}</dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt>Contado</dt>
            <dd>{q(counted)}</dd>
          </div>
        </dl>
        <p
          className={`mt-3 rounded-md px-3 py-2 text-center font-semibold ${
            diff === 0
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
              : diff > 0
                ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {diff === 0 ? "Cuadra exacto ✓" : diff > 0 ? `Sobran ${q(diff)}` : `Faltan ${q(-diff)}`}
        </p>
        {state.error && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn-primary mt-4 w-full py-3">
          {pending ? "Cerrando…" : "Cerrar caja"}
        </button>
        <p className="mt-2 text-xs text-neutral-500">Después de cerrar ya no se puede cobrar en este turno.</p>
      </aside>
    </form>
  );
}
