// Solo servidor: números del día para el tablero de inicio.
import { PurchaseStatus, SaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayStart, todayISO } from "@/lib/format";
import { averageTicket, change, fromCents, profitOf, toCents, toQty } from "./calc";
import { addDays, periodLabel, periodsInRange } from "./range";
import { productAggregate, salesAggregate } from "./load";

/** Tablero de gerente/administrador para una sucursal. */
export async function getDashboard(branchId: string) {
  const today = todayISO();
  const start = dayStart(today)!;
  const now = new Date();
  const weekFrom = addDays(today, -6);
  // "Ayer a esta hora": compara contra el mismo tramo del día anterior, no contra el día completo
  const yStart = dayStart(addDays(today, -1))!;
  const yNow = new Date(now.getTime() - 86_400_000);

  const [week, yesterday, products, openCash, pendingPurchases, overduePurchases, cancelledToday] = await Promise.all([
    salesAggregate([branchId], dayStart(weekFrom)!, dayStart(today, 1)!, "dia"),
    prisma.sale.aggregate({ where: { branchId, status: SaleStatus.COMPLETED, createdAt: { gte: yStart, lt: yNow } }, _sum: { total: true }, _count: true }),
    productAggregate([branchId], start, dayStart(today, 1)!),
    prisma.cashSession.findMany({
      where: { branchId, status: "OPEN" },
      orderBy: { openedAt: "asc" },
      include: { user: { select: { name: true } }, sales: { where: { status: SaleStatus.COMPLETED }, select: { total: true } } },
    }),
    prisma.purchase.count({ where: { branchId, status: PurchaseStatus.ORDERED } }),
    prisma.purchase.count({ where: { branchId, status: PurchaseStatus.ORDERED, expectedAt: { lt: start } } }),
    prisma.sale.count({ where: { branchId, status: SaleStatus.CANCELLED, cancelledAt: { gte: start } } }),
  ]);

  const byDay = new Map<string, { total: number; tax: number; cost: number; count: number }>();
  for (const r of week) {
    const d = byDay.get(r.period) ?? { total: 0, tax: 0, cost: 0, count: 0 };
    d.total += toCents(r.total);
    d.tax += toCents(r.tax);
    d.cost += toCents(r.cost);
    d.count += r.count;
    byDay.set(r.period, d);
  }
  const t = byDay.get(today) ?? { total: 0, tax: 0, cost: 0, count: 0 };
  const p = profitOf(t);
  const yTotal = toCents(yesterday._sum.total);

  const names = await prisma.product.findMany({
    where: { id: { in: products.map((x) => x.productId) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const top = products
    .map((x) => ({ id: x.productId, name: nameOf.get(x.productId) ?? "—", qty: toQty(x.qty), revenue: fromCents(toCents(x.revenue)) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    today: {
      total: fromCents(t.total),
      count: t.count,
      avg: fromCents(averageTicket(t.total, t.count)),
      profit: fromCents(p.profit),
      margin: p.margin,
      vsYesterday: change(t.total, yTotal),
      yesterdaySoFar: fromCents(yTotal),
      cancelled: cancelledToday,
    },
    week: periodsInRange(weekFrom, today, "dia").map((d) => {
      const x = byDay.get(d) ?? { total: 0, tax: 0, cost: 0, count: 0 };
      return { label: periodLabel(d, "dia"), value: fromCents(x.total), secondary: fromCents(profitOf(x).profit) };
    }),
    top,
    openCash: openCash.map((c) => ({
      id: c.id,
      number: c.number,
      user: c.user.name,
      openedAt: c.openedAt,
      sales: c.sales.length,
      total: fromCents(c.sales.reduce((s, x) => s + toCents(x.total), 0)),
    })),
    purchases: { pending: pendingPurchases, overdue: overduePurchases },
  };
}

/** Lo que vendió hoy un cajero (para su propio inicio). */
export async function getMyDay(userId: string, branchId: string) {
  const start = dayStart(todayISO())!;
  const agg = await prisma.sale.aggregate({
    where: { userId, branchId, status: SaleStatus.COMPLETED, createdAt: { gte: start } },
    _sum: { total: true },
    _count: true,
  });
  return { count: agg._count, total: fromCents(toCents(agg._sum.total)) };
}
