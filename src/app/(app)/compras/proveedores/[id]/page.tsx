import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { dateTime, money, qty } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import { PURCHASE_STATUS } from "@/lib/purchases/status";
import { Badge, Flash } from "@/components/flash";
import { Pager, pageParam } from "@/components/pager";
import { setSupplierActive } from "../actions";

export const metadata = { title: "Proveedor · Tiendix" };
const MESSAGES: Record<string, string> = { creado: "Proveedor creado.", editado: "Cambios guardados." };
const PAGE_SIZE = 25;

export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; estado?: string; pagina?: string }>;
}) {
  const { availableBranches } = await requirePermission("purchases:manage");
  const { id } = await params;
  const sp = await searchParams;
  const page = pageParam(sp.pagina);

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) notFound();

  const branchIds = availableBranches.map((b) => b.id);
  const scope: Prisma.PurchaseWhereInput = { supplierId: id, branchId: { in: branchIds } };
  const status = sp.estado && sp.estado in PURCHASE_STATUS ? (sp.estado as PurchaseStatus) : undefined;
  const listWhere = { ...scope, ...(status ? { status } : {}) };

  const [received, open, count, purchases, topProducts] = await Promise.all([
    prisma.purchase.aggregate({ where: { ...scope, status: PurchaseStatus.RECEIVED }, _sum: { total: true }, _count: true, _max: { receivedAt: true } }),
    prisma.purchase.aggregate({
      where: { ...scope, status: { in: [PurchaseStatus.DRAFT, PurchaseStatus.ORDERED] } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.purchase.count({ where: listWhere }),
    prisma.purchase.findMany({
      where: listWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { branch: { select: { name: true } }, _count: { select: { items: true } } },
    }),
    prisma.purchaseItem.groupBy({
      by: ["productId"],
      where: { purchase: { ...scope, status: PurchaseStatus.RECEIVED } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 10,
    }),
  ]);
  const products = await prisma.product.findMany({
    where: { id: { in: topProducts.map((p) => p.productId) } },
    select: { id: true, name: true, sku: true, unit: true, cost: true },
  });
  const productBy = new Map(products.map((p) => [p.id, p]));

  return (
    <main>
      <p className="text-sm">
        <Link href="/compras/proveedores" className="text-blue-600 hover:underline">
          ← Proveedores
        </Link>
      </p>
      {sp.ok && MESSAGES[sp.ok] && <Flash kind="ok">{MESSAGES[sp.ok]}</Flash>}

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {supplier.name} {!supplier.active && <Badge tone="gray">Inactivo</Badge>}
          </h1>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Info label="NIT" value={supplier.taxId} />
            <Info label="Contacto" value={supplier.contactName} />
            <Info label="Teléfono" value={supplier.phone} href={supplier.phone ? `tel:${supplier.phone.replace(/[^\d+]/g, "")}` : undefined} />
            <Info label="Correo" value={supplier.email} href={supplier.email ? `mailto:${supplier.email}` : undefined} />
            <Info label="Dirección" value={supplier.address} />
          </dl>
          {supplier.notes && <p className="mt-2 max-w-2xl text-sm whitespace-pre-line text-neutral-600 dark:text-neutral-400">{supplier.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {supplier.active && (
            <Link href={`/compras/nueva?proveedor=${supplier.id}`} className="btn-primary">
              + Orden de compra
            </Link>
          )}
          <Link href={`/compras/proveedores/${supplier.id}/editar`} className="btn-secondary">
            Editar
          </Link>
          <form action={setSupplierActive.bind(null, supplier.id, !supplier.active)}>
            <button className="btn-secondary">{supplier.active ? "Desactivar" : "Activar"}</button>
          </form>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total comprado (recibido)" value={money(received._sum.total ?? 0)} sub={`${received._count} ${received._count === 1 ? "compra" : "compras"}`} />
        <Stat label="Pendiente de recibir" value={money(open._sum.total ?? 0)} sub={`${open._count} ${open._count === 1 ? "orden abierta" : "órdenes abiertas"}`} />
        <Stat label="Última recepción" value={received._max.receivedAt ? dateTime(received._max.receivedAt) : "—"} />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Historial de compras</h2>
          <form className="flex items-end gap-2 text-sm">
            <select name="estado" defaultValue={sp.estado ?? ""} className="input py-1.5">
              <option value="">Todos los estados</option>
              {Object.entries(PURCHASE_STATUS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="btn-secondary py-1.5">Filtrar</button>
          </form>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">Orden</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Sucursal</th>
                <th className="px-4 py-2 font-medium">Factura</th>
                <th className="px-4 py-2 text-right font-medium">Productos</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    <Link href={`/compras/${p.id}`} className="text-blue-600 hover:underline">
                      #{p.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{dateTime(p.receivedAt ?? p.createdAt)}</td>
                  <td className="px-4 py-2">{p.branch.name}</td>
                  <td className="px-4 py-2">{p.invoiceNumber ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{p._count.items}</td>
                  <td className={`px-4 py-2 text-right font-medium ${p.status === "CANCELLED" ? "text-neutral-400 line-through" : ""}`}>{money(p.total)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Badge>
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                    No hay compras {status ? "con este estado" : "a este proveedor todavía"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={count} params={{ estado: sp.estado }} />
      </section>

      {topProducts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Lo que más le compras</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 text-right font-medium">Cantidad recibida</th>
                  <th className="px-4 py-2 text-right font-medium">Total comprado</th>
                  <th className="px-4 py-2 text-right font-medium">Costo promedio con este proveedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {topProducts.map((t) => {
                  const p = productBy.get(t.productId);
                  const q = Number(t._sum.quantity ?? 0);
                  return (
                    <tr key={t.productId}>
                      <td className="px-4 py-2">
                        {p ? (
                          <Link href={`/productos/${p.id}`} className="hover:underline">
                            {p.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {p && <span className="block text-xs text-neutral-500">{p.sku}</span>}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {qty(q)} {p ? UNIT_LABELS[p.unit].short : ""}
                      </td>
                      <td className="px-4 py-2 text-right">{money(t._sum.total)}</td>
                      <td className="px-4 py-2 text-right">{q > 0 ? money(Number(t._sum.total ?? 0) / q) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Info({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-neutral-500">{label}:</dt>
      <dd>
        {value ? (
          href ? (
            <a href={href} className="text-blue-600 hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          "—"
        )}
      </dd>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}
