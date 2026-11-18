// Forma común de todos los reportes: la usan las páginas (tablas en pantalla)
// y la exportación a Excel, así lo que se ve y lo que se descarga es lo mismo.
import type { CellKind, CellValue } from "./xlsx";

export type { CellKind, CellValue };

export type ReportColumn = { key: string; label: string; kind: CellKind; /** No partir el texto en dos líneas (fechas). */ nowrap?: boolean };

export type ReportRow = Record<string, CellValue> & { _href?: string; _tone?: "red" | "amber" | "muted" };

export type ReportTable = {
  /** Nombre corto (hoja de Excel). */
  name: string;
  title: string;
  description?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow;
  /** Filas que se muestran en pantalla (en Excel van todas). */
  screenLimit?: number;
  empty?: string;
};

export type ReportStat = {
  label: string;
  value: CellValue;
  kind: CellKind;
  /** Texto pequeño debajo (p. ej. "+12 % vs. período anterior"). */
  hint?: string;
  tone?: "green" | "red" | "amber";
};

export type ReportBar = { label: string; value: number; secondary?: number };

export type Report = {
  key: ReportKey;
  title: string;
  stats: ReportStat[];
  tables: ReportTable[];
  /** Gráfica de barras (ventas y utilidad por período). */
  chart?: { title: string; valueLabel: string; secondaryLabel?: string; bars: ReportBar[] };
  notes?: string[];
};

export const REPORTS = [
  { key: "ventas", title: "Ventas", description: "Ventas por día, semana o mes y por cajero, con utilidad bruta y anuladas.", usesDates: true },
  { key: "productos", title: "Productos y utilidad", description: "Utilidad por producto y categoría, más y menos vendidos.", usesDates: true },
  { key: "inventario", title: "Inventario", description: "Stock bajo, existencias y valor del inventario al costo y a precio de venta.", usesDates: false },
  { key: "cortes", title: "Cortes de caja", description: "Cierres de caja con su arqueo: faltantes y sobrantes por cajero.", usesDates: true },
  { key: "compras", title: "Compras", description: "Compras recibidas por proveedor en un rango de fechas.", usesDates: true },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

export const isReportKey = (k: string): k is ReportKey => REPORTS.some((r) => r.key === k);
