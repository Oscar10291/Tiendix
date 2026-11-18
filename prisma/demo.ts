// Datos de demostración para probar los reportes: `pnpm db:demo`
// Crea 3 semanas de ventas en la Sucursal Central (turnos de caja con arqueo,
// algunas anuladas) y compras recibidas al proveedor de ejemplo.
// Necesita haber corrido antes `pnpm db:seed`. No lo uses en una base real.
import { PaymentMethod, Prisma, PrismaClient, StockMovementType } from "@prisma/client";
import { applyStockMovement } from "../src/lib/inventory/stock";
import { centsToDecimal, computeSale } from "../src/lib/pos/money";

const prisma = new PrismaClient();
const DAYS = 21;
const MARK = "Demo";

// Números pseudoaleatorios repetibles (mismo resultado en cada máquina)
let seed = 20261118;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

/** Fecha local de Guatemala (UTC−6) a instante UTC. */
const at = (day: Date, hour: number, minute = 0) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour + 6, minute));

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("No cargues datos de demostración en producción.");
  if (await prisma.sale.findFirst({ where: { note: MARK } })) {
    console.log("Los datos de demostración ya estaban cargados.");
    return;
  }
  const branch = await prisma.branch.findUniqueOrThrow({ where: { code: "CENTRAL" } });
  const cashier = await prisma.user.findUniqueOrThrow({ where: { email: "cajero@tiendix.local" } });
  const manager = await prisma.user.findUniqueOrThrow({ where: { email: "gerente@tiendix.local" } });
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: "seed-supplier-1" } });
  const products = await prisma.product.findMany({ where: { active: true, sku: { in: ["BEB-001", "BEB-002", "ABA-001", "ABA-002", "LIM-001", "SNK-001"] } } });
  if (products.length === 0) throw new Error("Corre primero `pnpm db:seed`.");
  // El jabón casi no se repone: así aparece en stock bajo
  const restock = products.filter((p) => p.sku !== "LIM-001");

  const now = new Date();
  const todayLocal = new Date(now.getTime() - 6 * 3_600_000);
  const today = new Date(Date.UTC(todayLocal.getUTCFullYear(), todayLocal.getUTCMonth(), todayLocal.getUTCDate()));
  let sales = 0;

  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86_400_000);
    const isToday = i === 0;

    // Compra cada lunes (y el primer día)
    if (i === DAYS - 1 || day.getUTCDay() === 1) {
      await prisma.$transaction(async (tx) => {
        const items = restock.map((p) => ({ productId: p.id, quantity: 36, unitCost: p.cost, total: p.cost.times(36) }));
        const total = items.reduce((s, it) => s.plus(it.total), new Prisma.Decimal(0));
        const purchase = await tx.purchase.create({
          data: {
            supplierId: supplier.id,
            branchId: branch.id,
            userId: manager.id,
            status: "RECEIVED",
            invoiceNumber: `F-${1000 + i}`,
            subtotal: total,
            total,
            note: MARK,
            orderedAt: at(day, 7),
            receivedAt: at(day, 8),
            receivedById: manager.id,
            createdAt: at(day, 7),
            items: { create: items },
          },
        });
        for (const it of items) {
          await applyStockMovement(tx, {
            type: StockMovementType.PURCHASE,
            branchId: branch.id,
            productId: it.productId,
            userId: manager.id,
            delta: new Prisma.Decimal(it.quantity),
            unitCost: it.unitCost,
            note: `Compra #${purchase.number} (demo)`,
            purchaseId: purchase.id,
          });
        }
      });
    }

    const opening = 50000; // Q500 de fondo
    const cs = await prisma.cashSession.create({
      data: { branchId: branch.id, userId: cashier.id, openingAmount: centsToDecimal(opening), openedAt: at(day, 8), openingNote: MARK },
    });

    const count = 6 + Math.floor(rand() * 12) + (day.getUTCDay() === 6 ? 8 : 0); // los sábados se vende más
    let cash = 0;
    let completed = 0;
    for (let s = 0; s < count; s++) {
      const minutes = 8 * 60 + Math.floor(((s + rand()) / count) * 10 * 60);
      const createdAt = at(day, Math.floor(minutes / 60), minutes % 60);
      if (isToday && createdAt > now) break;

      const lines = [...new Set(Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(products)))].map((p) => ({
        p,
        quantity: (1 + Math.floor(rand() * 3)) * 1000,
      }));
      const stock = await prisma.stock.findMany({ where: { branchId: branch.id, productId: { in: lines.map((l) => l.p.id) } } });
      const available = lines.filter((l) => Number(stock.find((x) => x.productId === l.p.id)?.quantity ?? 0) * 1000 >= l.quantity);
      if (available.length === 0) continue;

      const saleDiscount = rand() < 0.1 ? 100 : 0;
      const totals = computeSale(
        available.map((l) => ({ quantity: l.quantity, unitPrice: Math.round(Number(l.p.price) * 100), discount: 0, taxRate: Number(l.p.taxRate) })),
        saleDiscount,
      );
      const cancel = rand() < 0.04;
      await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: {
            branchId: branch.id,
            userId: cashier.id,
            cashSessionId: cs.id,
            subtotal: centsToDecimal(totals.subtotal),
            discount: centsToDecimal(totals.discount),
            tax: centsToDecimal(totals.tax),
            total: centsToDecimal(totals.total),
            note: MARK,
            createdAt,
            ...(cancel ? { status: "CANCELLED", cancelledAt: createdAt, cancelledById: manager.id, cancelReason: "Error de cobro (demo)" } : {}),
            items: {
              create: available.map((l, k) => ({
                productId: l.p.id,
                quantity: l.quantity / 1000,
                unitPrice: l.p.price,
                taxRate: l.p.taxRate,
                total: centsToDecimal(totals.lines[k].total),
                unitCost: l.p.cost,
              })),
            },
            payments: { create: { method: PaymentMethod.CASH, amount: centsToDecimal(totals.total), tendered: centsToDecimal(totals.total), change: 0, createdAt } },
          },
        });
        if (cancel) return;
        for (const l of available) {
          await applyStockMovement(tx, {
            type: StockMovementType.SALE,
            branchId: branch.id,
            productId: l.p.id,
            userId: cashier.id,
            delta: new Prisma.Decimal(l.quantity / 1000).negated(),
            unitCost: l.p.cost,
            note: `Venta #${sale.number} (demo)`,
            saleId: sale.id,
          });
        }
      });
      if (!cancel) {
        cash += totals.total;
        completed++;
      }
      sales++;
    }

    if (!isToday) {
      const diff = pick([0, 0, 0, 0, -500, 200, -1000, 50]);
      await prisma.cashSession.update({
        where: { id: cs.id },
        data: {
          status: "CLOSED",
          closedAt: at(day, 18, 30),
          salesCount: completed,
          cashSales: centsToDecimal(cash),
          expectedCash: centsToDecimal(opening + cash),
          countedCash: centsToDecimal(opening + cash + diff),
          difference: centsToDecimal(diff),
          closingNote: diff < 0 ? "Faltante (demo)" : null,
        },
      });
    }
  }
  console.log(`Listo: ${sales} ventas de demostración en ${DAYS} días (Sucursal Central). La caja de hoy del cajero quedó abierta.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
