import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { loadReport } from "@/lib/reports/load";
import { resolveScope, type ReportParams } from "@/lib/reports/scope";
import { isReportKey, REPORTS } from "@/lib/reports/types";
import { buildXlsx } from "@/lib/reports/xlsx";
import { dateTime } from "@/lib/format";

// Descarga el reporte en Excel con los mismos filtros que la pantalla.
export async function GET(req: NextRequest, { params }: { params: Promise<{ reporte: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  if (!can(session.user.role, "reports:view")) return new NextResponse("Sin permiso", { status: 403 });
  const { reporte } = await params;
  if (!isReportKey(reporte)) return new NextResponse("Reporte no encontrado", { status: 404 });

  const sp = Object.fromEntries(req.nextUrl.searchParams) as ReportParams;
  const scope = resolveScope(session, sp);
  if (!scope) return new NextResponse("No tienes una sucursal asignada", { status: 400 });

  const def = REPORTS.find((r) => r.key === reporte)!;
  const report = await loadReport(reporte, scope, { orden: sp.orden });
  const subtitle = def.usesDates ? `${scope.branchLabel} · ${scope.rangeLabel}` : scope.branchLabel;

  const book = report.tables.map((t) => ({
    name: t.name,
    title: [`${report.title} · ${t.title}`, subtitle],
    columns: t.columns.map((c) => ({ label: c.label, kind: c.kind })),
    rows: t.rows.map((r) => t.columns.map((c) => r[c.key] ?? null)),
    totals: t.totals ? t.columns.map((c) => t.totals![c.key] ?? null) : undefined,
  }));
  // Primera hoja: los indicadores principales (cada uno con su formato en su propia columna)
  const statsSheet = {
    name: "Resumen",
    title: [report.title, subtitle, `Generado ${dateTime(new Date())} por ${session.user.name}`],
    columns: [
      { label: "Indicador", kind: "text" as const, width: 30 },
      { label: "Valor", kind: "money" as const, width: 18 },
      { label: "Nota", kind: "text" as const, width: 40 },
    ],
    rows: report.stats.map((s): (string | number | null)[] => {
      // La columna "Valor" tiene formato de dinero; enteros y % se escriben como texto ya formateado
      if (s.kind === "money") return [s.label, typeof s.value === "number" ? s.value : null, s.hint ?? ""];
      const v = s.value;
      const text = v == null ? "—" : typeof v === "number" ? (s.kind === "percent" ? `${Math.round(v * 1000) / 10} %` : String(v)) : v;
      return [s.label, text, s.hint ?? ""];
    }),
  };
  for (const n of report.notes ?? []) statsSheet.rows.push([n, null, ""]);

  const file = buildXlsx([statsSheet, ...book]);
  const day = def.usesDates ? (scope.from === scope.to ? scope.from : `${scope.from}_a_${scope.to}`) : new Date().toISOString().slice(0, 10);
  const name = `tiendix-${reporte}-${day}.xlsx`;
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
