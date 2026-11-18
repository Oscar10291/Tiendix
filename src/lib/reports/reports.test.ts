// Pruebas de los cálculos de reportes y del generador de Excel: `pnpm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { addDays, isISODay, parseRange, periodLabel, periodStart, periodsInRange, presetRange, previousRange } from "./range";
import { averageTicket, cashDifferenceSummary, change, includedTax, profitOf, shortfall, toCents } from "./calc";
import { buildXlsx, columnName, sheetName } from "./xlsx";

test("fechas de calendario", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.ok(isISODay("2026-11-18"));
  assert.ok(!isISODay("2026-02-30"));
  assert.ok(!isISODay("18/11/2026"));
  assert.ok(!isISODay(undefined));
});

test("inicio de período: día, semana (lunes) y mes", () => {
  assert.equal(periodStart("2026-11-18", "dia"), "2026-11-18");
  assert.equal(periodStart("2026-11-18", "semana"), "2026-11-16"); // miércoles → lunes
  assert.equal(periodStart("2026-11-22", "semana"), "2026-11-16"); // domingo → lunes anterior
  assert.equal(periodStart("2026-11-16", "semana"), "2026-11-16");
  assert.equal(periodStart("2026-11-18", "mes"), "2026-11-01");
});

test("períodos de un rango incluyen los días sin ventas", () => {
  assert.deepEqual(periodsInRange("2026-11-15", "2026-11-18", "dia"), ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"]);
  assert.deepEqual(periodsInRange("2026-11-01", "2026-11-18", "semana"), ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
  assert.deepEqual(periodsInRange("2026-11-20", "2027-01-05", "mes"), ["2026-11-01", "2026-12-01", "2027-01-01"]);
  assert.equal(periodLabel("2026-11-18", "dia"), "mié 18 nov");
  assert.equal(periodLabel("2026-11-01", "mes"), "nov 2026");
});

test("atajos de fechas", () => {
  assert.deepEqual(presetRange("mes", "2026-11-18"), { from: "2026-11-01", to: "2026-11-18" });
  assert.deepEqual(presetRange("mes-ant", "2026-03-10"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(presetRange("mes-ant", "2026-01-10"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(presetRange("7d", "2026-11-18"), { from: "2026-11-12", to: "2026-11-18" });
  assert.deepEqual(previousRange("2026-11-12", "2026-11-18"), { from: "2026-11-05", to: "2026-11-11" });
});

test("parseRange: por defecto este mes, corrige fechas al revés y rangos largos", () => {
  assert.deepEqual(parseRange({}, "2026-11-18"), { from: "2026-11-01", to: "2026-11-18", grouping: "dia", notice: undefined });
  const swapped = parseRange({ desde: "2026-11-10", hasta: "2026-11-01" }, "2026-11-18");
  assert.equal(swapped.from, "2026-11-01");
  assert.equal(swapped.to, "2026-11-10");
  const year = parseRange({ desde: "2026-01-01", hasta: "2026-11-18" }, "2026-11-18");
  assert.equal(year.grouping, "mes");
  const forcedDaily = parseRange({ desde: "2026-01-01", hasta: "2026-11-18", agrupar: "dia" }, "2026-11-18");
  assert.equal(forcedDaily.grouping, "semana");
  assert.ok(forcedDaily.notice);
  const huge = parseRange({ desde: "2015-01-01", hasta: "2026-11-18" }, "2026-11-18");
  assert.equal(huge.to, "2026-11-18");
  assert.ok(huge.from > "2024-01-01");
  assert.ok(huge.notice);
  assert.equal(parseRange({ rango: "ayer" }, "2026-11-18").from, "2026-11-17");
  assert.equal(parseRange({ desde: "basura" }, "2026-11-18").from, "2026-11-01");
});

test("utilidad bruta = venta sin impuesto − costo", () => {
  // Q112 cobrados con 12 % de IVA incluido (Q12) y costo Q60 → utilidad Q40, margen 40 %
  const r = profitOf({ total: 11200, tax: 1200, cost: 6000 });
  assert.equal(r.net, 10000);
  assert.equal(r.profit, 4000);
  assert.equal(r.margin, 0.4);
  assert.equal(profitOf({ total: 0, tax: 0, cost: 0 }).margin, null);
  assert.equal(profitOf({ total: 1000, tax: 0, cost: 1500 }).profit, -500); // vendido bajo costo
  assert.equal(includedTax(11200, 12), 1200);
  assert.equal(includedTax(1000, 0), 0);
});

test("conversiones y promedios", () => {
  assert.equal(toCents("12.345"), 1235);
  assert.equal(toCents("0.1"), 10);
  assert.equal(toCents("-3.50"), -350);
  assert.equal(toCents(null), 0);
  assert.equal(averageTicket(10000, 3), 3333);
  assert.equal(averageTicket(10000, 0), 0);
  assert.equal(change(150, 100), 0.5);
  assert.equal(change(50, 100), -0.5);
  assert.equal(change(10, 0), null);
  assert.equal(shortfall(2, 10), 8);
  assert.equal(shortfall(12, 10), 0);
});

test("resumen de arqueos: faltantes y sobrantes por separado", () => {
  assert.deepEqual(cashDifferenceSummary([-500, 0, 200, -100, 0]), { short: -600, over: 200, net: -400, exact: 2, count: 5 });
});

test("nombres de columna y de hoja de Excel", () => {
  assert.equal(columnName(0), "A");
  assert.equal(columnName(25), "Z");
  assert.equal(columnName(26), "AA");
  assert.equal(columnName(701), "ZZ");
  const used = new Set<string>();
  assert.equal(sheetName("Ventas/día", used), "Ventas día");
  assert.equal(sheetName("Ventas/día", used), "Ventas día 2");
  assert.equal(sheetName("x".repeat(40), used).length, 31);
});

/** Lee un ZIP sin dependencias (solo para la prueba). */
function unzip(buf: Buffer) {
  const files = new Map<string, string>();
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString("utf8");
    const start = p + 30 + nameLen + extra;
    files.set(name, inflateRawSync(buf.subarray(start, start + size)).toString("utf8"));
    p = start + size;
  }
  return files;
}

test("buildXlsx arma un libro con hojas, formatos y texto escapado", () => {
  const buf = buildXlsx([
    {
      name: "Ventas",
      title: ["Ventas por día", "Sucursal Central"],
      columns: [
        { label: "Día", kind: "text" },
        { label: "Ventas", kind: "int" },
        { label: "Total", kind: "money" },
        { label: "Margen", kind: "percent" },
      ],
      rows: [
        ["lun 16 nov", 3, 150.5, 0.25],
        ["Café & <pan>", 0, 0, null],
      ],
      totals: ["Total", 3, 150.5, 0.25],
    },
    { name: "Vacía", columns: [{ label: "A", kind: "text" }], rows: [] },
  ]);
  const files = unzip(buf);
  assert.ok(files.has("[Content_Types].xml"));
  assert.ok(files.has("xl/worksheets/sheet2.xml"));
  const wb = files.get("xl/workbook.xml")!;
  assert.match(wb, /name="Ventas"/);
  assert.match(wb, /name="Vacía"/);
  const s1 = files.get("xl/worksheets/sheet1.xml")!;
  assert.match(s1, /Café &amp; &lt;pan&gt;/);
  assert.match(s1, /<c r="C5" s="1"><v>150.5<\/v><\/c>/); // dinero, fila 5 (2 títulos + blanco + encabezado)
  assert.match(s1, /<c r="D7" s="9"><v>0.25<\/v><\/c>/); // totales en negrita
  assert.match(s1, /ySplit="4"/);
});
