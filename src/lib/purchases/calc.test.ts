// Pruebas de los cálculos de compras: `pnpm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePurchase, decimalToCents, decimalToMilli, purchaseLineTotal, weightedAverageCost } from "./calc";

test("total de una orden de compra", () => {
  // 24 aguas a Q3.25 + 2.5 kg de queso a Q41.99
  const r = computePurchase([
    { quantity: 24000, unitCost: 325 },
    { quantity: 2500, unitCost: 4199 },
  ]);
  assert.deepEqual(r.lines, [7800, 10498]); // 104.975 → 104.98
  assert.equal(r.total, 18298);
  assert.equal(purchaseLineTotal({ quantity: 125, unitCost: 1000 }), 125);
  assert.equal(computePurchase([]).total, 0);
});

test("costo promedio ponderado", () => {
  // Había 10 a Q5.00 y entran 30 a Q6.00 → (50 + 180) / 40 = Q5.75
  assert.equal(weightedAverageCost({ stock: 10000, currentCost: 500, quantity: 30000, unitCost: 600 }), 575);
  // Sin existencia: toma el costo de la compra
  assert.equal(weightedAverageCost({ stock: 0, currentCost: 500, quantity: 5000, unitCost: 720 }), 720);
  // Existencia negativa (vendido sin stock): también toma el costo de la compra
  assert.equal(weightedAverageCost({ stock: -2000, currentCost: 500, quantity: 5000, unitCost: 720 }), 720);
  // Redondeo: 3 a Q1.00 + 1 a Q1.01 → 4.01/4 = 1.0025 → Q1.00
  assert.equal(weightedAverageCost({ stock: 3000, currentCost: 100, quantity: 1000, unitCost: 101 }), 100);
  // Mismo costo: no cambia
  assert.equal(weightedAverageCost({ stock: 7000, currentCost: 999, quantity: 3000, unitCost: 999 }), 999);
  // Cantidad cero: no cambia
  assert.equal(weightedAverageCost({ stock: 7000, currentCost: 999, quantity: 0, unitCost: 1 }), 999);
});

test("decimales de la base a enteros", () => {
  assert.equal(decimalToCents("12.50"), 1250);
  assert.equal(decimalToCents("0.29"), 29); // 0.29 * 100 = 28.999… sin Math.round
  assert.equal(decimalToMilli("1.005"), 1005);
  assert.equal(decimalToMilli("2"), 2000);
});
