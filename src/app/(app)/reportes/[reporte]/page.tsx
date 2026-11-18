import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { dateTime } from "@/lib/format";
import { loadReport, PRODUCT_ORDER_OPTIONS } from "@/lib/reports/load";
import { GROUPING_LABELS, PRESETS } from "@/lib/reports/range";
import { resolveScope, scopeQuery, type ReportParams } from "@/lib/reports/scope";
import { isReportKey, REPORTS } from "@/lib/reports/types";
import { ReportBody } from "@/components/report-view";
import { PrintPageButton } from "@/components/print-page-button";

export async function generateMetadata({ params }: { params: Promise<{ reporte: string }> }) {
  const { reporte } = await params;
  const def = REPORTS.find((r) => r.key === reporte);
  return { title: `${def?.title ?? "Reporte"} · Reportes · Tiendix` };
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ reporte: string }>; searchParams: Promise<ReportParams> }) {
  const session = await requirePermission("reports:view");
  const { reporte } = await params;
  if (!isReportKey(reporte)) notFound();
  const def = REPORTS.find((r) => r.key === reporte)!;
  const sp = await searchParams;
  const scope = resolveScope(session, sp);
  if (!scope) return <p className="text-neutral-600">No tienes una sucursal asignada.</p>;

  const report = await loadReport(reporte, scope, { orden: sp.orden });
  const extra = { orden: reporte === "productos" ? sp.orden : undefined };
  const branches = session.availableBranches;

  return (
    <main className="print-colors">
      {/* Hoja horizontal: las tablas de reportes son anchas */}
      <style>{"@page { size: letter landscape; margin: 12mm; }"}</style>
      <p className="text-sm print:hidden">
        <Link href="/reportes" className="text-blue-600 hover:underline">
          ← Reportes
        </Link>
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">{report.title}</h1>
        <div className="flex gap-2 print:hidden">
          <a href={`/reportes/${reporte}/excel?${scopeQuery(scope, extra)}`} className="btn-secondary">
            Descargar Excel
          </a>
          <PrintPageButton label="Imprimir / PDF" />
        </div>
      </div>
      <p className="text-sm text-neutral-500">
        {scope.branchLabel}
        {def.usesDates && ` · ${scope.rangeLabel}`}
        <span className="hidden print:inline"> · generado {dateTime(new Date())}</span>
      </p>

      <form className="mt-4 flex flex-wrap items-end gap-3 text-sm print:hidden">
        {branches.length > 1 && (
          <label>
            <span className="block text-xs text-neutral-500">Sucursal</span>
            <select name="sucursal" defaultValue={scope.branchParam} className="input py-1.5">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value="todas">Todas</option>
            </select>
          </label>
        )}
        {def.usesDates && (
          <>
            <label>
              <span className="block text-xs text-neutral-500">Desde</span>
              <input type="date" name="desde" defaultValue={scope.from} className="input py-1.5" />
            </label>
            <label>
              <span className="block text-xs text-neutral-500">Hasta</span>
              <input type="date" name="hasta" defaultValue={scope.to} className="input py-1.5" />
            </label>
          </>
        )}
        {reporte === "ventas" && (
          <label>
            <span className="block text-xs text-neutral-500">Agrupar por</span>
            <select name="agrupar" defaultValue={scope.grouping} className="input py-1.5">
              {Object.entries(GROUPING_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        {reporte === "productos" && (
          <label>
            <span className="block text-xs text-neutral-500">Ordenar por</span>
            <select name="orden" defaultValue={sp.orden ?? "utilidad"} className="input py-1.5">
              {PRODUCT_ORDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="btn-primary py-1.5">
          Ver
        </button>
      </form>

      {def.usesDates && (
        <nav className="mt-3 flex flex-wrap gap-2 text-xs print:hidden" aria-label="Atajos de fechas">
          {PRESETS.map((p) => {
            const q = new URLSearchParams({ sucursal: scope.branchParam, rango: p.key });
            if (extra.orden) q.set("orden", extra.orden);
            return (
              <Link key={p.key} href={`?${q}`} className="rounded-full border border-neutral-300 px-3 py-1 hover:border-blue-500 dark:border-neutral-700">
                {p.label}
              </Link>
            );
          })}
        </nav>
      )}

      {scope.notice && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{scope.notice}</p>}

      <ReportBody report={report} />
    </main>
  );
}
