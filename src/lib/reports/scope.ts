// Solo servidor: sucursal y fechas que abarca un reporte, a partir de la URL.
import type { CurrentSession } from "@/lib/auth/session";
import { dayStart, todayISO } from "@/lib/format";
import { parseRange, rangeLabel, type DateRange } from "./range";

export type ReportParams = { sucursal?: string; desde?: string; hasta?: string; agrupar?: string; rango?: string; orden?: string };

export type ReportScope = DateRange & {
  /** Sucursales incluidas (siempre dentro de las que el usuario puede ver). */
  branchIds: string[];
  /** "todas" o el id de la sucursal elegida, para conservarlo en enlaces. */
  branchParam: string;
  branchLabel: string;
  rangeLabel: string;
  /** Límites como instantes: desde las 00:00 del primer día hasta las 00:00 del día siguiente al último. */
  start: Date;
  end: Date;
};

/**
 * ?sucursal= puede ser "todas" o el id de una sucursal a la que el usuario tenga acceso.
 * Por defecto, la sucursal activa de la sesión.
 */
export function resolveScope(session: CurrentSession, params: ReportParams): ReportScope | null {
  const available = session.availableBranches;
  if (available.length === 0) return null;

  let branchIds: string[];
  let branchLabel: string;
  let branchParam: string;
  const chosen = available.find((b) => b.id === params.sucursal);
  if (params.sucursal === "todas" && available.length > 1) {
    branchIds = available.map((b) => b.id);
    branchLabel = "Todas las sucursales";
    branchParam = "todas";
  } else {
    const b = chosen ?? session.branch ?? available[0];
    branchIds = [b.id];
    branchLabel = b.name;
    branchParam = b.id;
  }

  const range = parseRange(params, todayISO());
  return {
    ...range,
    branchIds,
    branchParam,
    branchLabel,
    rangeLabel: rangeLabel(range.from, range.to),
    start: dayStart(range.from)!,
    end: dayStart(range.to, 1)!,
  };
}

/** Parámetros de la URL que hay que conservar en enlaces (exportar, ordenar, paginar). */
export function scopeQuery(scope: ReportScope, extra: Record<string, string | undefined> = {}) {
  const sp = new URLSearchParams({ sucursal: scope.branchParam, desde: scope.from, hasta: scope.to, agrupar: scope.grouping });
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  return sp.toString();
}
