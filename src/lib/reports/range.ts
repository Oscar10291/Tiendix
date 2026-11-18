// Rangos de fechas y agrupación por período para los reportes.
// Trabaja con fechas de calendario "AAAA-MM-DD" en la hora de la tienda;
// no importa nada de Prisma, así se puede probar con `pnpm test`.

export type Grouping = "dia" | "semana" | "mes";

export const GROUPING_LABELS: Record<Grouping, string> = { dia: "Día", semana: "Semana", mes: "Mes" };

/** Para `date_trunc` de PostgreSQL. */
export const GROUPING_SQL: Record<Grouping, "day" | "week" | "month"> = { dia: "day", semana: "week", mes: "month" };

/** Máximo de días que abarca un reporte (para que una consulta no tumbe la base). */
export const MAX_RANGE_DAYS = 731;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-17" → Date a medianoche UTC (solo para aritmética de calendario). */
function parse(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function isISODay(value: string | undefined): value is string {
  return !!value && ISO.test(value) && parse(value) !== null && fmt(parse(value)!) === value;
}

/** Suma (o resta) días a una fecha "AAAA-MM-DD". */
export function addDays(day: string, n: number) {
  const d = parse(day)!;
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Días entre dos fechas (b − a). */
export function daysBetween(a: string, b: string) {
  return Math.round((parse(b)!.getTime() - parse(a)!.getTime()) / 86_400_000);
}

/** Inicio del período que contiene `day`: el mismo día, el lunes de esa semana o el día 1 del mes. */
export function periodStart(day: string, g: Grouping) {
  if (g === "dia") return day;
  if (g === "mes") return `${day.slice(0, 7)}-01`;
  const dow = parse(day)!.getUTCDay(); // 0 = domingo
  return addDays(day, -((dow + 6) % 7));
}

/** Todos los períodos de un rango (inclusive), para mostrar también los que no tuvieron ventas. */
export function periodsInRange(from: string, to: string, g: Grouping) {
  const out: string[] = [];
  let p = periodStart(from, g);
  while (p <= to && out.length < 1000) {
    out.push(p);
    p = g === "dia" ? addDays(p, 1) : g === "semana" ? addDays(p, 7) : nextMonth(p);
  }
  return out;
}

function nextMonth(day: string) {
  const [y, m] = day.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Etiqueta corta de un período: "lun 17 nov", "sem. 17 nov", "nov 2026". */
export function periodLabel(start: string, g: Grouping) {
  const d = parse(start)!;
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];
  if (g === "mes") return `${month} ${d.getUTCFullYear()}`;
  if (g === "semana") return `sem. ${day} ${month}`;
  return `${WEEKDAYS[d.getUTCDay()]} ${day} ${month}`;
}

/** "17 nov 2026" */
export function dayLabel(day: string) {
  const d = parse(day)!;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const PRESETS = [
  { key: "hoy", label: "Hoy" },
  { key: "ayer", label: "Ayer" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "mes", label: "Este mes" },
  { key: "mes-ant", label: "Mes anterior" },
  { key: "30d", label: "Últimos 30 días" },
  { key: "anio", label: "Este año" },
] as const;
export type Preset = (typeof PRESETS)[number]["key"];

/** Fechas de un atajo ("este mes", "últimos 7 días"…), relativas a `today`. */
export function presetRange(preset: Preset, today: string): { from: string; to: string } {
  switch (preset) {
    case "hoy":
      return { from: today, to: today };
    case "ayer":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "mes":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "mes-ant": {
      const first = `${today.slice(0, 7)}-01`;
      const last = addDays(first, -1);
      return { from: `${last.slice(0, 7)}-01`, to: last };
    }
    case "anio":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

export type DateRange = { from: string; to: string; grouping: Grouping; notice?: string };

/**
 * Lee ?desde=&hasta=&agrupar= de la URL. Por defecto: este mes, agrupado por día.
 * Corrige fechas al revés y rangos demasiado largos (y lo avisa en `notice`).
 */
export function parseRange(params: { desde?: string; hasta?: string; agrupar?: string; rango?: string }, today: string): DateRange {
  let { from, to } = presetRange("mes", today);
  let notice: string | undefined;

  const preset = PRESETS.find((p) => p.key === params.rango)?.key;
  if (preset) ({ from, to } = presetRange(preset, today));
  if (isISODay(params.desde)) from = params.desde;
  if (isISODay(params.hasta)) to = params.hasta;
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    from = addDays(to, -(MAX_RANGE_DAYS - 1));
    notice = `El rango máximo es de ${MAX_RANGE_DAYS} días; se muestra desde ${dayLabel(from)}.`;
  }

  const days = daysBetween(from, to) + 1;
  let grouping: Grouping = params.agrupar === "semana" || params.agrupar === "mes" || params.agrupar === "dia" ? params.agrupar : days > 62 ? "mes" : "dia";
  // Por día, un año serían 365 filas: más de 92 días se agrupa por semana como mínimo
  if (grouping === "dia" && days > 92) {
    grouping = "semana";
    notice ??= "Con más de 92 días se agrupa por semana.";
  }
  return { from, to, grouping, notice };
}

/** El mismo largo de rango justo antes (para comparar: "vs. período anterior"). */
export function previousRange(from: string, to: string) {
  const days = daysBetween(from, to) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/** "17 nov 2026" o "1 nov 2026 – 17 nov 2026" */
export function rangeLabel(from: string, to: string) {
  return from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
}
