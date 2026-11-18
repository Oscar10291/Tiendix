// Formatos de números y fechas usados en todas las pantallas.
// Para usar otra moneda o país, cambia estas constantes.
export const LOCALE = "es-GT";
export const CURRENCY = "GTQ";
export const TIME_ZONE = "America/Guatemala";

const moneyFmt = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY });
const qtyFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeZone: TIME_ZONE });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });

type Num = number | string | { toString(): string } | null | undefined;

const toNumber = (v: Num) => (v == null ? 0 : Number(v.toString()));

/** Q 12.50 */
export const money = (v: Num) => moneyFmt.format(toNumber(v));
/** 12 · 1.5 · 0.125 (hasta 3 decimales, sin ceros de más) */
export const qty = (v: Num) => qtyFmt.format(toNumber(v));
/** 17/11/26 16:45 */
export const dateTime = (d: Date) => dateTimeFmt.format(d);
/** 17 nov 2026 */
export const date = (d: Date) => dateFmt.format(d);

/** "2026-11-17" como inicio del día en la hora de la tienda (Guatemala, UTC-6). */
export function dayStart(value: string | undefined, plusDays = 0) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const offset = TIME_ZONE === "America/Guatemala" ? "-06:00" : "Z";
  const d = new Date(`${value}T00:00:00${offset}`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d;
}

/** Fecha de hoy en la tienda como "2026-11-17" (para filtros). */
export const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
