import Link from "next/link";
import { StockMovementType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { dayStart } from "@/lib/format";
import { MOVEMENT_TYPE_LABELS } from "@/lib/inventory/reasons";
import { MovementsTable } from "@/components/movements-table";
import { Pager, pageParam } from "@/components/pager";

const PAGE_SIZE = 50;

export default async function KardexPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string; tipo?: string; desde?: string; hasta?: string; pagina?: string }>;
}) {
  const { branch } = await requirePermission("inventory:view");
  const { producto, tipo, desde, hasta, pagina } = await searchParams;
  const page = pageParam(pagina);

  if (!branch) {
    return <p className="text-neutral-600">No tienes una sucursal asignada.</p>;
  }

  const where: Prisma.StockMovementWhereInput = { branchId: branch.id };
  if (producto) where.productId = producto;
  if (tipo && tipo in StockMovementType) where.type = tipo as StockMovementType;
  const from = dayStart(desde);
  const to = dayStart(hasta, 1);
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };

  const [total, movements, product] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true } }, product: { select: { id: true, name: true, sku: true, unit: true } } },
    }),
    producto ? prisma.product.findUnique({ where: { id: producto }, select: { id: true, name: true } }) : null,
  ]);

  return (
    <main>
      <p className="text-sm">
        <Link href="/inventario" className="text-blue-600 hover:underline">
          ← Inventario
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">Kárdex</h1>
      <p className="text-sm text-neutral-500">
        Historial de entradas y salidas de {branch.name}
        {product && (
          <>
            {" "}
            · <strong>{product.name}</strong>{" "}
            <Link href="/inventario/kardex" className="text-blue-600 hover:underline">
              (ver todos)
            </Link>
          </>
        )}
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-2">
        {producto && <input type="hidden" name="producto" value={producto} />}
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">Tipo</span>
          <select name="tipo" defaultValue={tipo ?? ""} className="input w-auto">
            <option value="">Todos</option>
            {Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">Desde</span>
          <input type="date" name="desde" defaultValue={desde} className="input w-auto" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta} className="input w-auto" />
        </label>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <MovementsTable movements={movements} hideProduct={Boolean(producto)} />
      <Pager page={page} pageSize={PAGE_SIZE} total={total} params={{ producto, tipo, desde, hasta }} />
    </main>
  );
}
