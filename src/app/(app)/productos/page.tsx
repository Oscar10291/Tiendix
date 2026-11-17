import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { cleanCode, productSearchWhere } from "@/lib/catalog";
import { descendantIds, getCategoryTree } from "@/lib/categories";
import { money, qty } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import { ScanInput } from "@/components/scan-input";
import { Badge } from "@/components/flash";
import { Pager, pageParam } from "@/components/pager";
import { StockBadge } from "@/components/stock-badge";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; estado?: string; pagina?: string }>;
}) {
  const { user, branch } = await requirePermission("products:view");
  const canManage = can(user.role, "products:manage");
  const { q = "", categoria = "", estado = "activos", pagina } = await searchParams;
  const page = pageParam(pagina);

  const tree = await getCategoryTree();
  const where: Prisma.ProductWhereInput = { ...productSearchWhere(q) };
  if (categoria === "sin") where.categoryId = null;
  else if (categoria) where.categoryId = { in: descendantIds(tree, categoria) };
  if (estado === "activos") where.active = true;
  if (estado === "inactivos") where.active = false;

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        barcodes: { select: { code: true }, orderBy: [{ quantity: "asc" }, { code: "asc" }], take: 3 },
        stock: branch ? { where: { branchId: branch.id }, select: { quantity: true } } : false,
      },
    }),
  ]);
  const categoryPath = new Map(tree.map((c) => [c.id, c.path]));
  const code = cleanCode(q);
  const looksLikeCode = /^[\w.\-/]{3,}$/.test(code) && !/\s/.test(q.trim());

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Productos</h1>
        <div className="flex gap-2">
          <Link href="/productos/categorias" className="btn-secondary">
            Categorías
          </Link>
          {canManage && (
            <Link href="/productos/nuevo" className="btn-primary">
              + Nuevo producto
            </Link>
          )}
        </div>
      </div>

      <form className="mt-6 flex flex-wrap gap-2">
        <ScanInput defaultValue={q} className="w-full max-w-md" />
        <select name="categoria" defaultValue={categoria} className="input w-auto">
          <option value="">Todas las categorías</option>
          <option value="sin">(Sin categoría)</option>
          {tree.map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={estado} className="input w-auto">
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
          <option value="todos">Activos e inactivos</option>
        </select>
        <button className="btn-secondary">Buscar</button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Producto</th>
              <th className="hidden px-4 py-2 font-medium sm:table-cell">Código de barras</th>
              <th className="px-4 py-2 text-right font-medium">Precio</th>
              <th className="px-4 py-2 text-right font-medium">Existencia{branch ? ` (${branch.name})` : ""}</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {products.map((p) => {
              const stock = p.stock?.[0]?.quantity ?? 0;
              return (
                <tr key={p.id} className={p.active ? "" : "text-neutral-400"}>
                  <td className="px-4 py-2">
                    <Link href={`/productos/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-xs text-neutral-500">
                      {p.sku}
                      {p.categoryId && categoryPath.has(p.categoryId) ? ` · ${categoryPath.get(p.categoryId)}` : ""}
                    </span>
                  </td>
                  <td className="hidden px-4 py-2 font-mono text-xs sm:table-cell">{p.barcodes.map((b) => b.code).join(", ") || "—"}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{money(p.price)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {p.trackStock ? (
                      <>
                        {qty(stock)} {UNIT_LABELS[p.unit].short}{" "}
                        <StockBadge quantity={stock} minStock={p.minStock} />
                      </>
                    ) : (
                      <span className="text-xs text-neutral-500">No controla</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{p.active ? <Badge tone="green">Activo</Badge> : <Badge tone="gray">Inactivo</Badge>}</td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  {q ? `No hay productos que coincidan con "${q}".` : "No hay productos que coincidan."}
                  {canManage && q && looksLikeCode && (
                    <Link href={`/productos/nuevo?codigo=${encodeURIComponent(code)}`} className="btn-primary ml-3">
                      Crear producto con el código {code}
                    </Link>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} params={{ q, categoria, estado }} />
    </main>
  );
}
