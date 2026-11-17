import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getCategoryTree } from "@/lib/categories";
import { money, qty } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import { Badge, Flash } from "@/components/flash";
import { StockBadge } from "@/components/stock-badge";
import { MovementsTable } from "@/components/movements-table";
import { setProductActive } from "../actions";

const MESSAGES: Record<string, string> = { creado: "Producto creado.", editado: "Cambios guardados." };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { user, branch, availableBranches } = await requirePermission("products:view");
  const { id } = await params;
  const { ok } = await searchParams;
  const canManage = can(user.role, "products:manage");
  const canViewInventory = can(user.role, "inventory:view");
  const canMove = can(user.role, "inventory:manage");

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      barcodes: { orderBy: { code: "asc" } },
      stock: { where: { branchId: { in: availableBranches.map((b) => b.id) } } },
    },
  });
  if (!product) notFound();

  const [tree, movements] = await Promise.all([
    getCategoryTree(),
    canViewInventory && branch
      ? prisma.stockMovement.findMany({
          where: { productId: id, branchId: branch.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { user: { select: { name: true } }, product: { select: { id: true, name: true, sku: true, unit: true } } },
        })
      : Promise.resolve([]),
  ]);
  const category = tree.find((c) => c.id === product.categoryId);
  const unit = UNIT_LABELS[product.unit];
  const stockBy = new Map(product.stock.map((s) => [s.branchId, s.quantity]));
  const cost = Number(product.cost);
  const price = Number(product.price);

  return (
    <main>
      <p className="text-sm">
        <Link href="/productos" className="text-blue-600 hover:underline">
          ← Productos
        </Link>
      </p>
      {ok && MESSAGES[ok] && <Flash kind="ok">{MESSAGES[ok]}</Flash>}

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            SKU {product.sku} · {category?.path ?? "Sin categoría"} · {unit.label}{" "}
            {product.active ? <Badge tone="green">Activo</Badge> : <Badge tone="gray">Inactivo</Badge>}
          </p>
          {product.description && <p className="mt-2 max-w-2xl text-sm">{product.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canMove && product.active && product.trackStock && (
            <Link href={`/inventario/movimiento?producto=${product.id}`} className="btn-primary">
              Entrada / salida
            </Link>
          )}
          {canManage && (
            <>
              <Link href={`/productos/${product.id}/editar`} className="btn-secondary">
                Editar
              </Link>
              <form action={setProductActive.bind(null, product.id, !product.active)}>
                <button className="btn-secondary">{product.active ? "Desactivar" : "Activar"}</button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card title="Precio de venta">
          <p className="text-2xl font-semibold">{money(price)}</p>
          <p className="text-xs text-neutral-500">Impuesto incluido ({product.taxRate.toString()}%)</p>
        </Card>
        {canManage && (
          <Card title="Costo">
            <p className="text-2xl font-semibold">{money(cost)}</p>
            {price > 0 && cost > 0 && <p className="text-xs text-neutral-500">Margen {(((price - cost) / price) * 100).toFixed(1)}%</p>}
          </Card>
        )}
        <Card title="Códigos de barras">
          {product.barcodes.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin códigos</p>
          ) : (
            <ul className="space-y-1 font-mono text-sm">
              {product.barcodes.map((b) => (
                <li key={b.id}>
                  {b.code}
                  {!b.quantity.equals(1) && <span className="ml-2 font-sans text-xs text-neutral-500">= {qty(b.quantity)} {unit.short}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {product.trackStock ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Existencias</h2>
          <p className="text-xs text-neutral-500">Mínimo: {qty(product.minStock)} {unit.short}</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {availableBranches.map((b) => {
              const q = stockBy.get(b.id) ?? 0;
              return (
                <li key={b.id} className={`rounded-lg border p-3 ${b.id === branch?.id ? "border-blue-500" : "border-neutral-200 dark:border-neutral-800"}`}>
                  <span className="block text-sm text-neutral-500">{b.name}</span>
                  <span className="text-xl font-semibold">
                    {qty(q)} {unit.short}
                  </span>{" "}
                  <StockBadge quantity={q} minStock={product.minStock} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="mt-8 text-sm text-neutral-500">Este producto no controla existencias (servicio).</p>
      )}

      {canViewInventory && branch && product.trackStock && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Últimos movimientos en {branch.name}</h2>
            <Link href={`/inventario/kardex?producto=${product.id}`} className="text-sm text-blue-600 hover:underline">
              Ver kárdex completo →
            </Link>
          </div>
          <MovementsTable movements={movements} hideProduct />
        </section>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-1 text-sm text-neutral-500">{title}</h2>
      {children}
    </div>
  );
}
