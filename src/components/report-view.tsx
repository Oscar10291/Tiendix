import Link from "next/link";
import { money, qty } from "@/lib/format";
import type { CellKind, CellValue, Report, ReportBar, ReportStat, ReportTable } from "@/lib/reports/types";

const pctFmt = new Intl.NumberFormat("es-GT", { style: "percent", maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 });

/** Valor de una celda con su formato (dinero, cantidad, %, entero). */
export function formatCell(value: CellValue, kind: CellKind) {
  if (value === null || value === undefined || value === "") return kind === "text" ? "" : "—";
  if (typeof value === "string") return value;
  switch (kind) {
    case "money":
      return money(value);
    case "qty":
      return qty(value);
    case "percent":
      return pctFmt.format(value);
    case "int":
      return intFmt.format(value);
    default:
      return String(value);
  }
}

const TONE_TEXT = { green: "text-green-700 dark:text-green-400", red: "text-red-600 dark:text-red-400", amber: "text-amber-700 dark:text-amber-400" };

export function StatCards({ stats }: { stats: ReportStat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <dt className="text-xs text-neutral-500">{s.label}</dt>
          <dd className={`mt-1 text-xl font-semibold tabular-nums ${s.tone ? TONE_TEXT[s.tone] : ""}`}>{formatCell(s.value, s.kind)}</dd>
          {s.hint && <dd className="mt-0.5 text-xs text-neutral-500">{s.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/**
 * Gráfica de barras sencilla (sin librerías): una o dos series en el mismo eje,
 * con línea de cero si hay valores negativos (p. ej. utilidad negativa).
 */
export function BarChart({
  title,
  valueLabel,
  secondaryLabel,
  bars,
}: {
  title: string;
  valueLabel: string;
  secondaryLabel?: string;
  bars: ReportBar[];
}) {
  if (bars.length === 0) return null;
  const values = bars.flatMap((b) => [b.value, b.secondary ?? 0]);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const span = hi - lo || 1;
  const zero = (hi / span) * 100; // % desde arriba donde va la línea de cero
  const two = secondaryLabel !== undefined;
  // Con muchas barras, se rotula solo una de cada N para que no se encimen
  const every = Math.ceil(bars.length / 8);

  const bar = (v: number, cls: string) => {
    const h = (Math.abs(v) / span) * 100;
    return (
      <span
        className={`absolute w-full ${cls} ${v >= 0 ? "rounded-t" : "rounded-b"}`}
        style={v >= 0 ? { bottom: `${100 - zero}%`, height: `${h}%` } : { top: `${zero}%`, height: `${h}%` }}
      />
    );
  };

  return (
    <figure className="rounded-lg border border-neutral-200 p-4 break-inside-avoid dark:border-neutral-800">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        {two && (
          <span className="flex gap-4 text-xs text-neutral-600 dark:text-neutral-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-[#2a78d6] dark:bg-[#3987e5]" /> {valueLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-[#eb6834] dark:bg-[#d95926]" /> {secondaryLabel}
            </span>
          </span>
        )}
      </figcaption>
      <div className="mt-2 flex items-start gap-2">
        <div className="flex h-44 w-16 shrink-0 flex-col justify-between text-right text-[10px] text-neutral-500 tabular-nums">
          <span>{money(hi)}</span>
          {lo < 0 && <span>{money(lo)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative flex h-44 items-stretch gap-[2px] border-b border-neutral-200 dark:border-neutral-800">
            {lo < 0 && <span className="absolute inset-x-0 border-t border-neutral-300 dark:border-neutral-700" style={{ top: `${zero}%` }} />}
            {bars.map((b, i) => (
              <div key={i} className="group relative flex flex-1 gap-[2px] hover:bg-neutral-100 dark:hover:bg-neutral-900" tabIndex={0}>
                <span className="relative flex-1">{bar(b.value, "bg-[#2a78d6] dark:bg-[#3987e5]")}</span>
                {two && <span className="relative flex-1">{bar(b.secondary ?? 0, "bg-[#eb6834] dark:bg-[#d95926]")}</span>}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs shadow-md group-hover:block group-focus:block dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <span className="block font-medium">{b.label}</span>
                  <span className="block tabular-nums">
                    {valueLabel}: {money(b.value)}
                  </span>
                  {two && (
                    <span className="block tabular-nums">
                      {secondaryLabel}: {money(b.secondary ?? 0)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] text-[10px] text-neutral-500">
            {bars.map((b, i) => (
              <span key={i} className="flex-1 truncate text-center">
                {i % every === 0 ? b.label.replace(/^(lun|mar|mié|jue|vie|sáb|dom) /, "") : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

export function ReportTableView({ table }: { table: ReportTable }) {
  const shown = table.screenLimit ? table.rows.slice(0, table.screenLimit) : table.rows;
  const hidden = table.rows.length - shown.length;
  // Columna que lleva el enlace al detalle (producto, proveedor, corte u orden)
  const linkKey = ["name", "supplier", "number"].find((k) => table.columns.some((c) => c.key === k));
  const align = (k: CellKind) => (k === "text" ? "text-left" : "text-right tabular-nums");
  return (
    <section className="break-inside-avoid-page">
      <h2 className="text-lg font-semibold">{table.title}</h2>
      {table.description && <p className="text-sm text-neutral-500">{table.description}</p>}
      <div className="mt-2 overflow-x-auto rounded-lg border print:overflow-visible border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm print:text-xs">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              {table.columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-medium whitespace-nowrap ${align(c.kind)}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {shown.map((r, i) => (
              <tr
                key={i}
                className={r._tone === "red" ? "bg-red-50/60 dark:bg-red-950/30" : r._tone === "amber" ? "bg-amber-50/60 dark:bg-amber-950/30" : ""}
              >
                {table.columns.map((c) => {
                  const text = formatCell(r[c.key], c.kind);
                  return (
                    <td key={c.key} className={`px-3 py-1.5 ${c.kind === "text" && !c.nowrap ? "" : "whitespace-nowrap"} ${align(c.kind)}`}>
                      {r._href && c.key === linkKey ? (
                        <Link href={r._href} className="text-blue-600 hover:underline print:text-inherit">
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {table.rows.length === 0 && (
              <tr>
                <td colSpan={table.columns.length} className="px-3 py-6 text-center text-neutral-500">
                  {table.empty ?? "Sin datos."}
                </td>
              </tr>
            )}
          </tbody>
          {table.totals && table.rows.length > 0 && (
            <tfoot className="border-t-2 border-neutral-300 font-semibold dark:border-neutral-700">
              <tr>
                {table.columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${align(c.kind)}`}>
                    {table.totals![c.key] === undefined ? "" : formatCell(table.totals![c.key], c.kind)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {hidden > 0 && (
        <p className="mt-1 text-xs text-neutral-500 print:hidden">
          Se muestran {shown.length} de {table.rows.length}. Descarga el Excel para ver todos.
        </p>
      )}
    </section>
  );
}

export function ReportBody({ report }: { report: Report }) {
  return (
    <div className="mt-6 space-y-8">
      <StatCards stats={report.stats} />
      {report.chart && <BarChart {...report.chart} />}
      {report.tables.map((t) => (
        <ReportTableView key={t.name} table={t} />
      ))}
      {report.notes && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-neutral-500">
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
