// Pruebas de los cálculos de la caja: `pnpm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToDecimal, computeSale, countDenominations, milliToDecimal, parseMoney, parsePercent, parseQuantity, percentOf } from "./money";

test("parseMoney entiende lo que escribe el cajero", () => {
  assert.equal(parseMoney("12"), 1200);
  assert.equal(parseMoney("12.5"), 1250);
  assert.equal(parseMoney("12,05"), 1205);
  assert.equal(parseMoney("Q 7"), 700);
  assert.equal(parseMoney("0.1"), 10);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("-5"), null);
  assert.equal(parseMoney("1.234"), null);
  assert.equal(parseMoney("abc"), null);
});

test("parseQuantity y parsePercent", () => {
  assert.equal(parseQuantity("1"), 1000);
  assert.equal(parseQuantity("0,125"), 125);
  assert.equal(parseQuantity("2.5"), 2500);
  assert.equal(parseQuantity("1.2345"), null);
  assert.equal(parsePercent("10"), 10);
  assert.equal(parsePercent("12.5%"), 12.5);
  assert.equal(parsePercent("150"), null);
});

test("conversiones a texto decimal", () => {
  assert.equal(centsToDecimal(1250), "12.50");
  assert.equal(centsToDecimal(5), "0.05");
  assert.equal(centsToDecimal(-305), "-3.05");
  assert.equal(milliToDecimal(1500), "1.5");
  assert.equal(milliToDecimal(2000), "2");
  assert.equal(milliToDecimal(125), "0.125");
});

test("venta simple sin descuentos, impuesto incluido 12 %", () => {
  // 2 aguas a Q5 + 1 refresco a Q7 = Q17
  const r = computeSale([
    { quantity: 2000, unitPrice: 500, discount: 0, taxRate: 12 },
    { quantity: 1000, unitPrice: 700, discount: 0, taxRate: 12 },
  ]);
  assert.equal(r.subtotal, 1700);
  assert.equal(r.total, 1700);
  // IVA incluido: 10 × 12/112 = 1.07 ; 7 × 12/112 = 0.75
  assert.equal(r.tax, 107 + 75);
  assert.equal(r.error, undefined);
});

test("descuento por línea y por venta", () => {
  const r = computeSale(
    [
      { quantity: 3000, unitPrice: 1000, discount: 300, taxRate: 12 }, // 30 − 3 = 27
      { quantity: 1000, unitPrice: 1300, discount: 0, taxRate: 0 }, // 13
    ],
    400, // − Q4
  );
  assert.equal(r.lines[0].total, 2700);
  assert.equal(r.subtotal, 4000);
  assert.equal(r.discount, 400);
  assert.equal(r.total, 3600);
  // Reparto del descuento: 27/40 × 4 = 2.70 → línea 1 neta 24.30 → IVA 2.60 ; línea 2 sin impuesto
  assert.equal(r.lines[0].tax, 260);
  assert.equal(r.lines[1].tax, 0);
});

test("productos a granel redondean al centavo", () => {
  // 0.333 kg × Q10 = 3.33
  const r = computeSale([{ quantity: 333, unitPrice: 1000, discount: 0, taxRate: 0 }]);
  assert.equal(r.total, 333);
  // 1.255 kg × Q1 = 1.255 → 1.26
  assert.equal(computeSale([{ quantity: 1255, unitPrice: 100, discount: 0, taxRate: 0 }]).total, 126);
});

test("descuentos inválidos se reportan", () => {
  assert.match(computeSale([{ quantity: 1000, unitPrice: 500, discount: 600, taxRate: 0 }]).error ?? "", /línea 1/);
  assert.match(computeSale([{ quantity: 1000, unitPrice: 500, discount: 0, taxRate: 0 }], 501).error ?? "", /venta/);
  // Descuento del 100 % es válido: total 0
  assert.equal(computeSale([{ quantity: 1000, unitPrice: 500, discount: 0, taxRate: 12 }], 500).total, 0);
});

test("porcentajes y arqueo por denominación", () => {
  assert.equal(percentOf(1999, 10), 200);
  assert.equal(percentOf(1000, 12.5), 125);
  assert.equal(countDenominations({ "200": 1, "20": 2, "0.25": 3 }), 20000 + 4000 + 75);
});
