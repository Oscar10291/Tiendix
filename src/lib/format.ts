// Formatos de números y fechas usados en todas las pantallas.
// Para usar otra moneda o país, cambia estas constantes.
export const LOCALE = "es-GT";
export const CURRENCY = "GTQ";
export const TIME_ZONE = "America/Guatemala";

const moneyFmt = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY });
const qtyFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });

type Num = number | string | { toString(): string } | null | undefined;

const toNumber = (v: Num) => (v == null ? 0 : Number(v.toString()));

/** Q 12.50 */
export const money = (v: Num) => moneyFmt.format(toNumber(v));
/** 12 · 1.5 · 0.125 (hasta 3 decimales, sin ceros de más) */
export const qty = (v: Num) => qtyFmt.format(toNumber(v));
/** 17/11/26 16:45 */
export const dateTime = (d: Date) => dateTimeFmt.format(d);
