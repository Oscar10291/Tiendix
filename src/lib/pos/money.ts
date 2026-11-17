// Cálculos de dinero de la caja en CENTAVOS (números enteros) para evitar errores
// de redondeo de JavaScript (0.1 + 0.2 = 0.30000000000000004).
// Se usa igual en el navegador (vista previa) y en el servidor (cobro real),
// por eso aquí no se importa nada de Prisma.

/** Convierte lo escrito ("12", "12.5", "12,50", " Q 7 ") a centavos. null si no es válido. */
export function parseMoney(value: string | null | undefined): number | null {
  const text = String(value ?? "")
    .trim()
    .replace(/^Q\s*/i, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Convierte una cantidad ("2", "1.5", "0,125") a milésimas. null si no es válida. */
export function parseQuantity(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{0,3})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  return Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
}

/** Porcentaje ("10", "12.5") a número. null si no es válido o pasa de 100. */
export function parsePercent(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim().replace(",", ".").replace("%", "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n <= 100 ? n : null;
}

/** Centavos a texto decimal para la base de datos: 1250 → "12.50". */
export const centsToDecimal = (cents: number) => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

/** Milésimas a texto decimal: 1500 → "1.5". */
export const milliToDecimal = (milli: number) => {
  const whole = Math.floor(milli / 1000);
  const frac = String(milli % 1000).padStart(3, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
};

/** Redondeo "al centavo más cercano"; los .5 suben (como en la calculadora). */
const round = (n: number) => Math.round(n + Number.EPSILON);

/** Porcentaje de un monto, en centavos. */
export const percentOf = (cents: number, percent: number) => round((cents * percent) / 100);

export type SaleLineInput = {
  /** Cantidad en milésimas (1 unidad = 1000) */
  quantity: number;
  /** Precio unitario en centavos (con impuesto incluido) */
  unitPrice: number;
  /** Descuento de la línea en centavos */
  discount: number;
  /** % de impuesto incluido en el precio, p. ej. 12 */
  taxRate: number;
};

export type SaleTotals = {
  lines: { gross: number; discount: number; total: number; tax: number }[];
  /** Suma de las líneas ya con su descuento */
  subtotal: number;
  /** Descuento a toda la venta */
  discount: number;
  total: number;
  /** Impuesto incluido en el total (para el ticket y reportes) */
  tax: number;
  /** Mensaje si algún descuento no es válido */
  error?: string;
};

/**
 * Calcula los totales de una venta.
 * - Cada línea: cantidad × precio − descuento de la línea.
 * - El descuento de la venta se resta al final.
 * - El impuesto ya viene incluido en el precio; se calcula la parte que corresponde
 *   repartiendo el descuento de la venta entre las líneas.
 */
export function computeSale(lines: SaleLineInput[], saleDiscount = 0): SaleTotals {
  let error: string | undefined;
  const computed = lines.map((l, i) => {
    const gross = round((l.quantity * l.unitPrice) / 1000);
    if (l.discount < 0 || l.discount > gross) error ??= `El descuento de la línea ${i + 1} es mayor que su importe.`;
    const discount = Math.min(Math.max(l.discount, 0), gross);
    return { gross, discount, total: gross - discount, tax: 0 };
  });
  const subtotal = computed.reduce((s, l) => s + l.total, 0);
  if (saleDiscount < 0 || saleDiscount > subtotal) error ??= "El descuento de la venta es mayor que el subtotal.";
  const discount = Math.min(Math.max(saleDiscount, 0), subtotal);
  const total = subtotal - discount;

  // Reparte el descuento de la venta proporcionalmente; la última línea con importe se lleva el residuo
  let remaining = discount;
  const lastWithAmount = computed.findLastIndex((l) => l.total > 0);
  computed.forEach((l, i) => {
    const share = i === lastWithAmount ? remaining : subtotal > 0 ? round((discount * l.total) / subtotal) : 0;
    remaining -= share;
    const net = l.total - share;
    const rate = lines[i].taxRate;
    l.tax = rate > 0 ? round((net * rate) / (100 + rate)) : 0;
  });

  return { lines: computed, subtotal, discount, total, tax: computed.reduce((s, l) => s + l.tax, 0), error };
}

/** Billetes y monedas de quetzal para el arqueo, de mayor a menor. */
export const DENOMINATIONS: { value: string; cents: number; label: string; kind: "billete" | "moneda" }[] = [
  { value: "200", cents: 20000, label: "Q200", kind: "billete" },
  { value: "100", cents: 10000, label: "Q100", kind: "billete" },
  { value: "50", cents: 5000, label: "Q50", kind: "billete" },
  { value: "20", cents: 2000, label: "Q20", kind: "billete" },
  { value: "10", cents: 1000, label: "Q10", kind: "billete" },
  { value: "5", cents: 500, label: "Q5", kind: "billete" },
  { value: "1", cents: 100, label: "Q1", kind: "moneda" },
  { value: "0.50", cents: 50, label: "50 ¢", kind: "moneda" },
  { value: "0.25", cents: 25, label: "25 ¢", kind: "moneda" },
  { value: "0.10", cents: 10, label: "10 ¢", kind: "moneda" },
  { value: "0.05", cents: 5, label: "5 ¢", kind: "moneda" },
  { value: "0.01", cents: 1, label: "1 ¢", kind: "moneda" },
];

/** Suma un conteo por denominación { "200": 2, "0.25": 4 } en centavos. */
export function countDenominations(counts: Record<string, number>) {
  return DENOMINATIONS.reduce((sum, d) => sum + d.cents * (counts[d.value] ?? 0), 0);
}
