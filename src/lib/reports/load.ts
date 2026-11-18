// Solo servidor: consultas de cada reporte.
// Reglas comunes:
// - Solo cuentan las ventas vigentes (las anuladas se muestran aparte).
// - El costo de lo vendido es el costo promedio guardado en cada línea al cobrar
//   (SaleItem.unitCost). Si una línea quedó con costo 0 (producto sin costo cargado
//   en ese momento), se usa el costo promedio actual del producto.
// - Utilidad bruta = venta sin impuesto − costo (los precios incluyen IVA).
// - El descuento a toda la venta se reparte entre sus líneas en proporción a su importe.
import { Prisma, PurchaseStatus, SaleStatus, UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TIME_ZONE, dateTime, dayStart, money } from "@/lib/format";
import { getCategoryTree } from "@/lib/categories";
import { averageTicket, cashDifferenceSummary, change, fromCents, margin, profitOf, shortfall, toCents, toQty } from "./calc";
import { GROUPING_LABELS, GROUPING_SQL, periodLabel, periodsInRange, previousRange, type Grouping } from "./range";
import type { ReportScope } from "./scope";
import type { Report, ReportKey, ReportRow, ReportStat } from "./types";

const UNIT: Record<UnitOfMeasure, string> = { UNIT: "u", KG: "kg", G: "g", L: "L", ML: "ml", M: "m", BOX: "caja" };

/** Fecha local de la tienda truncada al período, como "AAAA-MM-DD". */
const periodSql = (column: Prisma.Sql, g: Grouping) =>
  Prisma.sql`to_char(date_trunc(${GROUPING_SQL[g]}, (${column} AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE}), 'YYYY-MM-DD')`;

/** Costo de una línea de venta (ver reglas arriba). */
const LINE_COST = Prisma.sql`si.quantity * COALESCE(NULLIF(si."unitCost", 0), p.cost)`;

const pct = (current: number, previous: number) => {
  const c = change(current, previous);
  if (c === null) return undefined;
  const sign = c > 0 ? "+" : "";
  return `${sign}${Math.round(c * 100)} % vs. período anterior`;
};

// ─────────────────────────────────────────────
// Ventas por período y por cajero
// ─────────────────────────────────────────────

type SalesAgg = { period: string; userId: string; count: number; total: Prisma.Decimal; tax: Prisma.Decimal; discount: Prisma.Decimal; cost: Prisma.Decimal };

/** Ventas vigentes agrupadas por período y cajero, con su costo. */
export function salesAggregate(branchIds: string[], start: Date, end: Date, g: Grouping) {
  return prisma.$queryRaw<SalesAgg[]>`
    WITH sc AS (
      SELECT s.id, s."userId", s.total, s.tax, s.discount, s."createdAt",
             (SELECT COALESCE(SUM(${LINE_COST}), 0) FROM sale_items si JOIN products p ON p.id = si."productId" WHERE si."saleId" = s.id) AS cost
      FROM sales s
      WHERE s.status = 'COMPLETED' AND s."branchId" IN (${Prisma.join(branchIds)})
        AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
    )
    SELECT ${periodSql(Prisma.sql`"createdAt"`, g)} AS period, "userId", COUNT(*)::int AS count,
           SUM(total) AS total, SUM(tax) AS tax, SUM(discount) AS discount, SUM(cost) AS cost
    FROM sc GROUP BY 1, 2`;
}

function emptyTotals() {
  return { count: 0, total: 0, tax: 0, discount: 0, cost: 0 };
}
type Totals = ReturnType<typeof emptyTotals>;
function add(t: Totals, r: SalesAgg) {
  t.count += r.count;
  t.total += toCents(r.total);
  t.tax += toCents(r.tax);
  t.discount += toCents(r.discount);
  t.cost += toCents(r.cost);
}
function salesRow(label: string, t: Totals): ReportRow {
  const p = profitOf(t);
  return {
    label,
    count: t.count,
    total: fromCents(t.total),
    discount: fromCents(t.discount),
    tax: fromCents(t.tax),
    net: fromCents(p.net),
    cost: fromCents(t.cost),
    profit: fromCents(p.profit),
    margin: p.margin,
    avg: fromCents(averageTicket(t.total, t.count)),
  };
}
const SALES_COLUMNS = (first: string) =>
  [
    { key: "label", label: first, kind: "text", nowrap: true },
    { key: "count", label: "Ventas", kind: "int" },
    { key: "total", label: "Total cobrado", kind: "money" },
    { key: "discount", label: "Descuentos", kind: "money" },
    { key: "tax", label: "IVA incluido", kind: "money" },
    { key: "net", label: "Venta sin IVA", kind: "money" },
    { key: "cost", label: "Costo", kind: "money" },
    { key: "profit", label: "Utilidad bruta", kind: "money" },
    { key: "margin", label: "Margen", kind: "percent" },
    { key: "avg", label: "Ticket promedio", kind: "money" },
  ] as const;

async function salesReport(scope: ReportScope): Promise<Report> {
  const prev = previousRange(scope.from, scope.to);
  const [rows, cancelled, prevRows] = await Promise.all([
    salesAggregate(scope.branchIds, scope.start, scope.end, scope.grouping),
    prisma.sale.aggregate({
      where: { status: SaleStatus.CANCELLED, branchId: { in: scope.branchIds }, createdAt: { gte: scope.start, lt: scope.end } },
      _count: true,
      _sum: { total: true },
    }),
    salesAggregate(scope.branchIds, dayStart(prev.from)!, dayStart(prev.to, 1)!, "mes"),
  ]);

  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const byPeriod = new Map<string, Totals>();
  const byUser = new Map<string, Totals>();
  const total = emptyTotals();
  for (const r of rows) {
    if (!byPeriod.has(r.period)) byPeriod.set(r.period, emptyTotals());
    if (!byUser.has(r.userId)) byUser.set(r.userId, emptyTotals());
    add(byPeriod.get(r.period)!, r);
    add(byUser.get(r.userId)!, r);
    add(total, r);
  }
  const previous = emptyTotals();
  for (const r of prevRows) add(previous, r);

  const periods = periodsInRange(scope.from, scope.to, scope.grouping);
  const periodRows = periods.map((p) => salesRow(periodLabel(p, scope.grouping), byPeriod.get(p) ?? emptyTotals()));
  const userRows = [...byUser.entries()]
    .map(([id, t]) => salesRow(userName.get(id) ?? "—", t))
    .sort((a, b) => Number(b.total) - Number(a.total));
  const totalRow = salesRow("Total", total);
  const p = profitOf(total);

  const stats: ReportStat[] = [
    { label: "Total vendido", value: fromCents(total.total), kind: "money", hint: pct(total.total, previous.total) },
    { label: "Ventas", value: total.count, kind: "int", hint: pct(total.count, previous.count) },
    { label: "Ticket promedio", value: fromCents(averageTicket(total.total, total.count)), kind: "money" },
    {
      label: "Utilidad bruta",
      value: fromCents(p.profit),
      kind: "money",
      hint: p.margin !== null ? `Margen ${Math.round(p.margin * 1000) / 10} %` : undefined,
      tone: p.profit < 0 ? "red" : undefined,
    },
  ];
  if (cancelled._count > 0) {
    stats.push({ label: "Anuladas", value: cancelled._count, kind: "int", hint: `por ${money(cancelled._sum.total)}`, tone: "amber" });
  }

  return {
    key: "ventas",
    title: "Ventas",
    stats,
    chart: {
      title: `Ventas por ${GROUPING_LABELS[scope.grouping].toLowerCase()}`,
      valueLabel: "Total cobrado",
      secondaryLabel: "Utilidad bruta",
      bars: periods.map((per) => {
        const t = byPeriod.get(per) ?? emptyTotals();
        return { label: periodLabel(per, scope.grouping), value: fromCents(t.total), secondary: fromCents(profitOf(t).profit) };
      }),
    },
    tables: [
      { name: `Por ${GROUPING_LABELS[scope.grouping].toLowerCase()}`, title: `Por ${GROUPING_LABELS[scope.grouping].toLowerCase()}`, columns: [...SALES_COLUMNS(GROUPING_LABELS[scope.grouping])], rows: periodRows, totals: totalRow },
      { name: "Por cajero", title: "Por cajero", columns: [...SALES_COLUMNS("Cajero")], rows: userRows, totals: totalRow, empty: "Sin ventas en estas fechas." },
    ],
    notes: [
      "Solo ventas vigentes; las anuladas no suman.",
      "Utilidad bruta = venta sin IVA − costo promedio de lo vendido al momento de cobrar.",
    ],
  };
}

// ─────────────────────────────────────────────
// Productos: utilidad, más y menos vendidos
// ─────────────────────────────────────────────

type ProductAgg = { productId: string; qty: Prisma.Decimal; revenue: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal; sales: number };

/** Lo vendido por producto (cantidad, venta con y sin IVA, costo). */
export function productAggregate(branchIds: string[], start: Date, end: Date) {
  // El IVA guardado en cada venta se reparte entre sus líneas según el IVA que le toca
  // a cada una; así la venta sin IVA por producto suma exactamente lo mismo que el reporte de ventas.
  return prisma.$queryRaw<ProductAgg[]>`
    WITH l AS (
      SELECT si."productId", si."saleId", si.quantity, s.tax AS "saleTax",
             CASE WHEN s.subtotal > 0 THEN si.total * s.total / s.subtotal ELSE 0 END AS revenue,
             si."taxRate", ${LINE_COST} AS cost
      FROM sale_items si
      JOIN sales s ON s.id = si."saleId"
      JOIN products p ON p.id = si."productId"
      WHERE s.status = 'COMPLETED' AND s."branchId" IN (${Prisma.join(branchIds)})
        AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
    ), t AS (
      SELECT *, revenue * "taxRate" / (100 + "taxRate") AS "lineTax",
             SUM(revenue * "taxRate" / (100 + "taxRate")) OVER (PARTITION BY "saleId") AS "saleLineTax"
      FROM l
    )
    SELECT "productId", SUM(quantity) AS qty, SUM(revenue) AS revenue,
           SUM(revenue - CASE WHEN "saleLineTax" > 0 THEN "saleTax" * "lineTax" / "saleLineTax" ELSE 0 END) AS net,
           SUM(cost) AS cost, COUNT(DISTINCT "saleId")::int AS sales
    FROM t GROUP BY 1`;
}

const PRODUCT_ORDERS = {
  utilidad: "Utilidad",
  vendidos: "Cantidad vendida",
  venta: "Venta",
  margen: "Margen",
} as const;
export type ProductOrder = keyof typeof PRODUCT_ORDERS;
export const PRODUCT_ORDER_OPTIONS = Object.entries(PRODUCT_ORDERS).map(([value, label]) => ({ value, label }));

async function productsReport(scope: ReportScope, order: string | undefined): Promise<Report> {
  const [agg, tree] = await Promise.all([productAggregate(scope.branchIds, scope.start, scope.end), getCategoryTree()]);
  const categoryPath = new Map(tree.map((c) => [c.id, c.path]));
  // Productos activos (para "menos vendidos", incluidos los que no se vendieron) y los vendidos aunque ya estén inactivos
  const products = await prisma.product.findMany({
    where: { OR: [{ active: true, createdAt: { lt: scope.end } }, { id: { in: agg.map((a) => a.productId) } }] },
    select: { id: true, sku: true, name: true, unit: true, active: true, categoryId: true },
  });
  const byId = new Map(agg.map((a) => [a.productId, a]));

  type P = { id: string; sku: string; name: string; unit: string; category: string; active: boolean; qty: number; revenue: number; net: number; cost: number; profit: number; margin: number | null; sales: number };
  const all: P[] = products.map((p) => {
    const a = byId.get(p.id);
    const net = toCents(a?.net);
    const cost = toCents(a?.cost);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: UNIT[p.unit],
      category: (p.categoryId && categoryPath.get(p.categoryId)) || "Sin categoría",
      active: p.active,
      qty: toQty(a?.qty),
      revenue: toCents(a?.revenue),
      net,
      cost,
      profit: net - cost,
      margin: margin(net - cost, net),
      sales: a?.sales ?? 0,
    };
  });
  const sold = all.filter((p) => byId.has(p.id));

  const key = (order && order in PRODUCT_ORDERS ? order : "utilidad") as ProductOrder;
  const sorters: Record<ProductOrder, (a: P, b: P) => number> = {
    utilidad: (a, b) => b.profit - a.profit,
    vendidos: (a, b) => b.qty - a.qty,
    venta: (a, b) => b.revenue - a.revenue,
    margen: (a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity),
  };
  sold.sort((a, b) => sorters[key](a, b) || a.name.localeCompare(b.name));

  const toRow = (p: P): ReportRow => ({
    sku: p.sku,
    name: p.active ? p.name : `${p.name} (inactivo)`,
    category: p.category,
    qty: p.qty,
    unit: p.unit,
    sales: p.sales,
    revenue: fromCents(p.revenue),
    net: fromCents(p.net),
    cost: fromCents(p.cost),
    profit: fromCents(p.profit),
    margin: p.margin,
    _href: `/productos/${p.id}`,
    _tone: p.profit < 0 ? "red" : undefined,
  });

  // Por categoría
  const cats = new Map<string, { qty: number; revenue: number; net: number; cost: number; products: number }>();
  for (const p of sold) {
    const c = cats.get(p.category) ?? { qty: 0, revenue: 0, net: 0, cost: 0, products: 0 };
    c.revenue += p.revenue;
    c.net += p.net;
    c.cost += p.cost;
    c.products++;
    cats.set(p.category, c);
  }
  // Totales sobre los montos sin redondear (sumar los redondeos de cada producto puede dar 1 centavo de diferencia)
  const raw = (f: (a: ProductAgg) => Prisma.Decimal) => toCents(agg.reduce((s, a) => s.plus(f(a)), new Prisma.Decimal(0)));
  const T = { revenue: raw((a) => a.revenue), net: raw((a) => a.net), cost: raw((a) => a.cost) };
  const catRows: ReportRow[] = [...cats.entries()]
    .map(([name, c]) => ({
      category: name,
      products: c.products,
      revenue: fromCents(c.revenue),
      net: fromCents(c.net),
      cost: fromCents(c.cost),
      profit: fromCents(c.net - c.cost),
      margin: margin(c.net - c.cost, c.net),
      share: T.net - T.cost > 0 ? (c.net - c.cost) / (T.net - T.cost) : null,
    }))
    .sort((a, b) => Number(b.profit) - Number(a.profit));

  // Menos vendidos: productos activos con menos unidades vendidas (incluye los que no se vendieron)
  const least = all
    .filter((p) => p.active)
    .sort((a, b) => a.qty - b.qty || a.revenue - b.revenue || a.name.localeCompare(b.name));
  const unsold = least.filter((p) => p.qty === 0).length;

  const productColumns = [
    { key: "sku", label: "SKU", kind: "text" },
    { key: "name", label: "Producto", kind: "text" },
    { key: "category", label: "Categoría", kind: "text" },
    { key: "qty", label: "Cantidad", kind: "qty" },
    { key: "unit", label: "Unidad", kind: "text" },
    { key: "sales", label: "Nº ventas", kind: "int" },
    { key: "revenue", label: "Venta", kind: "money" },
    { key: "net", label: "Venta sin IVA", kind: "money" },
    { key: "cost", label: "Costo", kind: "money" },
    { key: "profit", label: "Utilidad bruta", kind: "money" },
    { key: "margin", label: "Margen", kind: "percent" },
  ] as const;
  const profitTotal = T.net - T.cost;

  return {
    key: "productos",
    title: "Productos y utilidad",
    stats: [
      { label: "Venta", value: fromCents(T.revenue), kind: "money" },
      { label: "Utilidad bruta", value: fromCents(profitTotal), kind: "money", tone: profitTotal < 0 ? "red" : undefined },
      { label: "Margen", value: margin(profitTotal, T.net), kind: "percent" },
      { label: "Productos vendidos", value: sold.length, kind: "int", hint: unsold > 0 ? `${unsold} activos sin ventas` : undefined },
    ],
    tables: [
      {
        name: "Por producto",
        title: `Por producto · ordenado por ${PRODUCT_ORDERS[key].toLowerCase()}`,
        columns: [...productColumns],
        rows: sold.map(toRow),
        totals: { name: "Total", revenue: fromCents(T.revenue), net: fromCents(T.net), cost: fromCents(T.cost), profit: fromCents(profitTotal), margin: margin(profitTotal, T.net) },
        screenLimit: 100,
        empty: "No se vendió nada en estas fechas.",
      },
      {
        name: "Por categoría",
        title: "Por categoría",
        columns: [
          { key: "category", label: "Categoría", kind: "text" },
          { key: "products", label: "Productos", kind: "int" },
          { key: "revenue", label: "Venta", kind: "money" },
          { key: "net", label: "Venta sin IVA", kind: "money" },
          { key: "cost", label: "Costo", kind: "money" },
          { key: "profit", label: "Utilidad bruta", kind: "money" },
          { key: "margin", label: "Margen", kind: "percent" },
          { key: "share", label: "% de la utilidad", kind: "percent" },
        ],
        rows: catRows,
        totals: { category: "Total", products: sold.length, revenue: fromCents(T.revenue), net: fromCents(T.net), cost: fromCents(T.cost), profit: fromCents(profitTotal), margin: margin(profitTotal, T.net) },
        empty: "No se vendió nada en estas fechas.",
      },
      {
        name: "Menos vendidos",
        title: "Menos vendidos",
        description: "Productos activos con menos unidades vendidas en estas fechas, empezando por los que no se vendieron.",
        columns: [
          { key: "sku", label: "SKU", kind: "text" },
          { key: "name", label: "Producto", kind: "text" },
          { key: "category", label: "Categoría", kind: "text" },
          { key: "qty", label: "Cantidad", kind: "qty" },
          { key: "unit", label: "Unidad", kind: "text" },
          { key: "revenue", label: "Venta", kind: "money" },
        ],
        rows: least.map(toRow),
        screenLimit: 30,
      },
    ],
    notes: ["La utilidad usa el costo promedio de cada producto al momento de la venta.", "Los descuentos a toda la venta se reparten entre sus productos."],
  };
}

// ─────────────────────────────────────────────
// Inventario: stock bajo y valor
// ─────────────────────────────────────────────

type StockRowDb = {
  branchId: string;
  branch: string;
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  unit: UnitOfMeasure;
  cost: Prisma.Decimal;
  price: Prisma.Decimal;
  minStock: Prisma.Decimal;
  quantity: Prisma.Decimal;
};

async function inventoryReport(scope: ReportScope): Promise<Report> {
  const [rows, tree] = await Promise.all([
    prisma.$queryRaw<StockRowDb[]>`
      SELECT b.id AS "branchId", b.name AS branch, p.id, p.sku, p.name, p."categoryId", p.unit, p.cost, p.price, p."minStock",
             COALESCE(s.quantity, 0) AS quantity
      FROM products p
      CROSS JOIN branches b
      LEFT JOIN stock s ON s."productId" = p.id AND s."branchId" = b.id
      WHERE p.active = true AND p."trackStock" = true AND b.id IN (${Prisma.join(scope.branchIds)})
      ORDER BY p.name, b.name`,
    getCategoryTree(),
  ]);
  const categoryPath = new Map(tree.map((c) => [c.id, c.path]));
  const multi = scope.branchIds.length > 1;

  const low: ReportRow[] = [];
  const perProduct = new Map<string, { r: StockRowDb; qty: number }>();
  const cats = new Map<string, { products: Set<string>; cost: number; price: number }>();
  let valueCost = 0;
  let valuePrice = 0;
  let out = 0;

  for (const r of rows) {
    const qty = toQty(r.quantity);
    const min = toQty(r.minStock);
    const category = (r.categoryId && categoryPath.get(r.categoryId)) || "Sin categoría";
    if (qty <= 0 || (min > 0 && qty <= min)) {
      if (qty <= 0) out++;
      low.push({
        branch: r.branch,
        sku: r.sku,
        name: r.name,
        category,
        quantity: qty,
        min,
        missing: shortfall(qty, min),
        unit: UNIT[r.unit],
        cost: fromCents(toCents(r.cost)),
        _href: `/productos/${r.id}`,
        _tone: qty <= 0 ? "red" : "amber",
      });
    }
    const positive = Math.max(qty, 0);
    const c = Math.round(positive * toCents(r.cost));
    const pr = Math.round(positive * toCents(r.price));
    valueCost += c;
    valuePrice += pr;
    const cat = cats.get(category) ?? { products: new Set(), cost: 0, price: 0 };
    cat.products.add(r.id);
    cat.cost += c;
    cat.price += pr;
    cats.set(category, cat);
    const pp = perProduct.get(r.id);
    if (pp) pp.qty += qty;
    else perProduct.set(r.id, { r, qty });
  }
  low.sort((a, b) => Number(a.quantity) - Number(b.quantity) || String(a.name).localeCompare(String(b.name)));

  const stockRows: ReportRow[] = [...perProduct.values()].map(({ r, qty }) => {
    const positive = Math.max(qty, 0);
    return {
      sku: r.sku,
      name: r.name,
      category: (r.categoryId && categoryPath.get(r.categoryId)) || "Sin categoría",
      quantity: qty,
      unit: UNIT[r.unit],
      cost: fromCents(toCents(r.cost)),
      value: fromCents(Math.round(positive * toCents(r.cost))),
      price: fromCents(toCents(r.price)),
      valuePrice: fromCents(Math.round(positive * toCents(r.price))),
      _href: `/productos/${r.id}`,
    };
  });
  stockRows.sort((a, b) => Number(b.value) - Number(a.value));

  const catRows: ReportRow[] = [...cats.entries()]
    .map(([name, c]) => ({ category: name, products: c.products.size, value: fromCents(c.cost), valuePrice: fromCents(c.price), share: valueCost > 0 ? c.cost / valueCost : null }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  return {
    key: "inventario",
    title: "Inventario",
    stats: [
      { label: "Valor al costo", value: fromCents(valueCost), kind: "money" },
      { label: "Valor a precio de venta", value: fromCents(valuePrice), kind: "money", hint: "con IVA incluido" },
      { label: "Stock bajo", value: low.length, kind: "int", tone: low.length > 0 ? "amber" : undefined, hint: multi ? "producto × sucursal" : undefined },
      { label: "Sin existencia", value: out, kind: "int", tone: out > 0 ? "red" : undefined },
    ],
    tables: [
      {
        name: "Stock bajo",
        title: "Stock bajo",
        description: "Productos en su mínimo o por debajo, o sin existencia. «Faltan» es lo que hace falta para llegar al mínimo.",
        columns: [
          ...(multi ? [{ key: "branch", label: "Sucursal", kind: "text" as const }] : []),
          { key: "sku", label: "SKU", kind: "text" },
          { key: "name", label: "Producto", kind: "text" },
          { key: "category", label: "Categoría", kind: "text" },
          { key: "quantity", label: "Existencia", kind: "qty" },
          { key: "min", label: "Mínimo", kind: "qty" },
          { key: "missing", label: "Faltan", kind: "qty" },
          { key: "unit", label: "Unidad", kind: "text" },
          { key: "cost", label: "Costo", kind: "money" },
        ],
        rows: low,
        empty: "Ningún producto tiene stock bajo. 👍",
      },
      {
        name: "Valor por categoría",
        title: "Valor por categoría",
        columns: [
          { key: "category", label: "Categoría", kind: "text" },
          { key: "products", label: "Productos", kind: "int" },
          { key: "value", label: "Valor al costo", kind: "money" },
          { key: "valuePrice", label: "Valor a precio de venta", kind: "money" },
          { key: "share", label: "% del valor", kind: "percent" },
        ],
        rows: catRows,
        totals: { category: "Total", products: perProduct.size, value: fromCents(valueCost), valuePrice: fromCents(valuePrice), share: valueCost > 0 ? 1 : null },
      },
      {
        name: "Existencias",
        title: multi ? "Existencias (suma de las sucursales)" : "Existencias",
        columns: [
          { key: "sku", label: "SKU", kind: "text" },
          { key: "name", label: "Producto", kind: "text" },
          { key: "category", label: "Categoría", kind: "text" },
          { key: "quantity", label: "Existencia", kind: "qty" },
          { key: "unit", label: "Unidad", kind: "text" },
          { key: "cost", label: "Costo promedio", kind: "money" },
          { key: "value", label: "Valor al costo", kind: "money" },
          { key: "price", label: "Precio", kind: "money" },
          { key: "valuePrice", label: "Valor a precio", kind: "money" },
        ],
        rows: stockRows,
        totals: { name: "Total", value: fromCents(valueCost), valuePrice: fromCents(valuePrice) },
        screenLimit: 50,
      },
    ],
    notes: ["Existencias al momento de abrir el reporte (no dependen de las fechas).", "Las existencias negativas no suman al valor."],
  };
}

// ─────────────────────────────────────────────
// Cortes de caja
// ─────────────────────────────────────────────

async function cashReport(scope: ReportScope): Promise<Report> {
  const [closed, open] = await Promise.all([
    prisma.cashSession.findMany({
      where: { status: "CLOSED", branchId: { in: scope.branchIds }, closedAt: { gte: scope.start, lt: scope.end } },
      orderBy: { closedAt: "desc" },
      include: { user: { select: { id: true, name: true } }, branch: { select: { name: true } } },
    }),
    prisma.cashSession.findMany({
      where: { status: "OPEN", branchId: { in: scope.branchIds } },
      orderBy: { openedAt: "asc" },
      include: { user: { select: { name: true } }, branch: { select: { name: true } } },
    }),
  ]);
  const multi = scope.branchIds.length > 1;

  const rows: ReportRow[] = closed.map((c) => {
    const diff = toCents(c.difference);
    return {
      number: `#${c.number}`,
      branch: c.branch.name,
      user: c.user.name,
      openedAt: dateTime(c.openedAt),
      closedAt: c.closedAt ? dateTime(c.closedAt) : "",
      sales: c.salesCount ?? 0,
      opening: fromCents(toCents(c.openingAmount)),
      cashSales: fromCents(toCents(c.cashSales)),
      expected: fromCents(toCents(c.expectedCash)),
      counted: fromCents(toCents(c.countedCash)),
      difference: fromCents(diff),
      result: diff === 0 ? "Cuadra" : diff > 0 ? "Sobrante" : "Faltante",
      note: c.closingNote ?? "",
      _href: `/caja/cortes/${c.id}`,
      _tone: diff < 0 ? "red" : diff > 0 ? "amber" : undefined,
    };
  });

  const byUser = new Map<string, { name: string; diffs: number[]; cashSales: number }>();
  for (const c of closed) {
    const u = byUser.get(c.user.id) ?? { name: c.user.name, diffs: [], cashSales: 0 };
    u.diffs.push(toCents(c.difference));
    u.cashSales += toCents(c.cashSales);
    byUser.set(c.user.id, u);
  }
  const userRows: ReportRow[] = [...byUser.values()]
    .map((u) => {
      const s = cashDifferenceSummary(u.diffs);
      return {
        user: u.name,
        count: s.count,
        exact: s.exact,
        cashSales: fromCents(u.cashSales),
        short: fromCents(s.short),
        over: fromCents(s.over),
        net: fromCents(s.net),
        _tone: s.short < 0 ? "red" : undefined,
      } satisfies ReportRow;
    })
    .sort((a, b) => Number(a.short) - Number(b.short));

  const all = cashDifferenceSummary(closed.map((c) => toCents(c.difference)));
  const cashTotal = closed.reduce((s, c) => s + toCents(c.cashSales), 0);

  return {
    key: "cortes",
    title: "Cortes de caja",
    stats: [
      { label: "Cortes cerrados", value: all.count, kind: "int", hint: all.count > 0 ? `${all.exact} cuadraron exacto` : undefined },
      { label: "Efectivo de ventas", value: fromCents(cashTotal), kind: "money" },
      { label: "Faltantes", value: fromCents(all.short), kind: "money", tone: all.short < 0 ? "red" : undefined },
      { label: "Sobrantes", value: fromCents(all.over), kind: "money", tone: all.over > 0 ? "amber" : undefined },
    ],
    tables: [
      {
        name: "Por cajero",
        title: "Resumen por cajero",
        description: "Faltantes y sobrantes se suman por separado: un sobrante no tapa un faltante.",
        columns: [
          { key: "user", label: "Cajero", kind: "text" },
          { key: "count", label: "Cortes", kind: "int" },
          { key: "exact", label: "Cuadraron", kind: "int" },
          { key: "cashSales", label: "Efectivo de ventas", kind: "money" },
          { key: "short", label: "Faltantes", kind: "money" },
          { key: "over", label: "Sobrantes", kind: "money" },
          { key: "net", label: "Neto", kind: "money" },
        ],
        rows: userRows,
        totals: { user: "Total", count: all.count, exact: all.exact, cashSales: fromCents(cashTotal), short: fromCents(all.short), over: fromCents(all.over), net: fromCents(all.net) },
        empty: "No se cerró ninguna caja en estas fechas.",
      },
      {
        name: "Cortes",
        title: "Cortes cerrados",
        columns: [
          { key: "number", label: "Corte", kind: "text" },
          ...(multi ? [{ key: "branch", label: "Sucursal", kind: "text" as const }] : []),
          { key: "user", label: "Cajero", kind: "text" },
          { key: "openedAt", label: "Apertura", kind: "text", nowrap: true },
          { key: "closedAt", label: "Cierre", kind: "text", nowrap: true },
          { key: "sales", label: "Ventas", kind: "int" },
          { key: "opening", label: "Fondo", kind: "money" },
          { key: "cashSales", label: "Efectivo ventas", kind: "money" },
          { key: "expected", label: "Esperado", kind: "money" },
          { key: "counted", label: "Contado", kind: "money" },
          { key: "difference", label: "Diferencia", kind: "money" },
          { key: "result", label: "Resultado", kind: "text" },
          { key: "note", label: "Nota", kind: "text" },
        ],
        rows,
        empty: "No se cerró ninguna caja en estas fechas.",
      },
    ],
    notes: open.length
      ? [`Cajas abiertas ahora: ${open.map((o) => `#${o.number} ${o.user.name}${multi ? ` (${o.branch.name})` : ""}, desde ${dateTime(o.openedAt)}`).join(" · ")}.`]
      : undefined,
  };
}

// ─────────────────────────────────────────────
// Compras por proveedor
// ─────────────────────────────────────────────

async function purchasesReport(scope: ReportScope): Promise<Report> {
  const [received, pending] = await Promise.all([
    prisma.purchase.findMany({
      where: { status: PurchaseStatus.RECEIVED, branchId: { in: scope.branchIds }, receivedAt: { gte: scope.start, lt: scope.end } },
      orderBy: { receivedAt: "desc" },
      include: { supplier: { select: { id: true, name: true, taxId: true } }, branch: { select: { name: true } }, _count: { select: { items: true } } },
    }),
    prisma.purchase.aggregate({
      where: { status: PurchaseStatus.ORDERED, branchId: { in: scope.branchIds } },
      _count: true,
      _sum: { total: true },
    }),
  ]);
  const multi = scope.branchIds.length > 1;

  const bySupplier = new Map<string, { id: string; name: string; taxId: string | null; count: number; subtotal: number; tax: number; total: number; last: Date | null }>();
  for (const p of received) {
    const s = bySupplier.get(p.supplier.id) ?? { ...p.supplier, count: 0, subtotal: 0, tax: 0, total: 0, last: null };
    s.count++;
    s.subtotal += toCents(p.subtotal);
    s.tax += toCents(p.tax);
    s.total += toCents(p.total);
    if (p.receivedAt && (!s.last || p.receivedAt > s.last)) s.last = p.receivedAt;
    bySupplier.set(p.supplier.id, s);
  }
  const total = received.reduce((s, p) => s + toCents(p.total), 0);
  const supplierRows: ReportRow[] = [...bySupplier.values()]
    .sort((a, b) => b.total - a.total)
    .map((s) => ({
      supplier: s.name,
      taxId: s.taxId ?? "",
      count: s.count,
      subtotal: fromCents(s.subtotal),
      tax: fromCents(s.tax),
      total: fromCents(s.total),
      share: total > 0 ? s.total / total : null,
      last: s.last ? dateTime(s.last) : "",
      _href: `/compras/proveedores/${s.id}`,
    }));

  const detail: ReportRow[] = received.map((p) => ({
    number: `#${p.number}`,
    receivedAt: p.receivedAt ? dateTime(p.receivedAt) : "",
    supplier: p.supplier.name,
    invoice: p.invoiceNumber ?? "",
    branch: p.branch.name,
    items: p._count.items,
    total: fromCents(toCents(p.total)),
    _href: `/compras/${p.id}`,
  }));

  return {
    key: "compras",
    title: "Compras",
    stats: [
      { label: "Total comprado", value: fromCents(total), kind: "money", hint: "solo órdenes recibidas" },
      { label: "Órdenes recibidas", value: received.length, kind: "int" },
      { label: "Proveedores", value: bySupplier.size, kind: "int" },
      {
        label: "Pendiente de recibir",
        value: fromCents(toCents(pending._sum.total)),
        kind: "money",
        hint: pending._count ? `${pending._count} ${pending._count === 1 ? "orden enviada" : "órdenes enviadas"} (cualquier fecha)` : undefined,
      },
    ],
    tables: [
      {
        name: "Por proveedor",
        title: "Por proveedor",
        columns: [
          { key: "supplier", label: "Proveedor", kind: "text" },
          { key: "taxId", label: "NIT", kind: "text" },
          { key: "count", label: "Órdenes", kind: "int" },
          { key: "subtotal", label: "Subtotal", kind: "money" },
          { key: "tax", label: "Impuesto", kind: "money" },
          { key: "total", label: "Total", kind: "money" },
          { key: "share", label: "% del total", kind: "percent" },
          { key: "last", label: "Última recepción", kind: "text", nowrap: true },
        ],
        rows: supplierRows,
        totals: { supplier: "Total", count: received.length, total: fromCents(total), share: total > 0 ? 1 : null },
        empty: "No se recibieron compras en estas fechas.",
      },
      {
        name: "Órdenes",
        title: "Órdenes recibidas",
        columns: [
          { key: "number", label: "Orden", kind: "text" },
          { key: "receivedAt", label: "Recibida", kind: "text", nowrap: true },
          { key: "supplier", label: "Proveedor", kind: "text" },
          { key: "invoice", label: "Factura", kind: "text" },
          ...(multi ? [{ key: "branch", label: "Sucursal", kind: "text" as const }] : []),
          { key: "items", label: "Productos", kind: "int" },
          { key: "total", label: "Total", kind: "money" },
        ],
        rows: detail,
        totals: { number: "Total", total: fromCents(total) },
        empty: "No se recibieron compras en estas fechas.",
      },
    ],
    notes: ["Las compras se cuentan por la fecha en que se recibió la mercadería."],
  };
}

/** Carga un reporte por su clave. */
export function loadReport(key: ReportKey, scope: ReportScope, opts: { orden?: string } = {}): Promise<Report> {
  switch (key) {
    case "ventas":
      return salesReport(scope);
    case "productos":
      return productsReport(scope, opts.orden);
    case "inventario":
      return inventoryReport(scope);
    case "cortes":
      return cashReport(scope);
    case "compras":
      return purchasesReport(scope);
  }
}
