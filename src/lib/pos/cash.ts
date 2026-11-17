// Solo para el servidor: consultas de turnos de caja (apertura, arqueo y cierre).
import { Prisma, PaymentMethod, SaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/auth/permissions";
import type { CurrentSession } from "@/lib/auth/session";

type Db = Prisma.TransactionClient | typeof prisma;

/** Caja abierta del usuario (en cualquier sucursal), o null. */
export function getOpenCashSession(userId: string) {
  return prisma.cashSession.findFirst({
    where: { userId, status: "OPEN" },
    include: { branch: { select: { id: true, name: true } } },
  });
}

/**
 * Números de un turno para el arqueo: ventas vigentes, efectivo cobrado y anuladas.
 * El efectivo esperado = fondo inicial + efectivo de ventas vigentes
 * (si una venta se anula con la caja abierta, se supone que el dinero se devolvió al cliente).
 */
export async function cashSessionTotals(db: Db, cashSessionId: string, openingAmount: Prisma.Decimal) {
  const [completed, cancelled, cash] = await Promise.all([
    db.sale.aggregate({
      where: { cashSessionId, status: SaleStatus.COMPLETED },
      _count: true,
      _sum: { total: true, discount: true },
    }),
    db.sale.aggregate({ where: { cashSessionId, status: SaleStatus.CANCELLED }, _count: true, _sum: { total: true } }),
    db.payment.aggregate({
      where: { method: PaymentMethod.CASH, sale: { cashSessionId, status: SaleStatus.COMPLETED } },
      _sum: { amount: true },
    }),
  ]);
  const zero = new Prisma.Decimal(0);
  const cashSales = cash._sum.amount ?? zero;
  return {
    salesCount: completed._count,
    salesTotal: completed._sum.total ?? zero,
    cancelledCount: cancelled._count,
    cancelledTotal: cancelled._sum.total ?? zero,
    cashSales,
    expectedCash: openingAmount.plus(cashSales),
  };
}

/** ¿Puede este usuario ver (o cerrar) el turno? El dueño, o gerente/admin con acceso a la sucursal. */
export function canAccessCashSession(session: CurrentSession, cs: { userId: string; branchId: string }) {
  if (cs.userId === session.user.id) return true;
  return can(session.user.role, "sales:view") && session.availableBranches.some((b) => b.id === cs.branchId);
}

/** ¿Puede ver la venta? El cajero que la cobró, o gerente/admin con acceso a la sucursal. */
export function canAccessSale(session: CurrentSession, sale: { userId: string; branchId: string }) {
  return canAccessCashSession(session, sale);
}
