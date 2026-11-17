import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, qty } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import { getStockList, getStockSummary, type StockFilter } from "@/lib/inventory/queries";
import { ScanInput } from "@/components/scan-input";
import { Pager, pageParam } from "@/components/pager";
import { StockBadge } from "@/components/stock-badge";

const PAGE_SIZE = 50;
const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "bajo", label: "Stock bajo" },
  { value: "sin", label: "Sin stock" },
];

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string; pagina?: string }> }) {
  const { user, branch } = await requirePermission("inventory:view");
  const canMove = can(user.role, "inventory:manage");
  const { q = "", ver, pagina } = await searchParams;
  const filter: StockFilter = ver === "bajo" || ver === "sin" ? ver : "todos";
  const page = pageParam(pagina);

  if (!branch) {
    return (
      <main>
        <h1 className="text-2xl font-bold">Inventario</h1>
        <p className="mt-4 text-neutral-600">No tienes una sucursal asignada. Pide a un administrador que te asigne una.</p>
      </main>
    );
  }

  const [summary, { rows, total }] = await Promise.all([
    getStockSummary(branch.id),
    getStockList(branch.id, { q, filter, page, pageSize: PAGE_SIZE }),
  ]);

  const filterHref = (v: StockFilter) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (v !== "todos") sp.set("ver", v);
    const s = sp.toString();
    return s ? `/inventario?${s}` : "/inventario";
  };

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventario</h1>
          <p className="text-sm text-neutral-500">{branch.name}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventario/kardex" className="btn-secondary">
            Kárdex
          </Link>
          {canMove && (
            <Link href="/inventario/movimiento" className="btn-primary">
              Registrar entrada / salida
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Productos con control" value={String(summary.products)} href={filterHref("todos")} />
        <Stat label="Stock bajo" value={String(summary.low)} tone={summary.low > 0 ? "amber" : undefined} href={filterHref("bajo")} />
        <Stat label="Sin stock" value={String(summary.out)} tone={summary.out > 0 ? "red" : undefined} href={filterHref("sin")} />
        <Stat label="Valor al costo" value={money(summary.value)} />
      </div>

      <form className="mt-6 flex flex-wrap gap-2">
        <ScanInput defaultValue={q} className="w-full max-w-md" />
        {filter !== "todos" && <input type="hidden" name="ver" value={filter} />}
        <button className="btn-secondary">Buscar</button>
      </form>
      <nav className="mt-3 flex gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={filterHref(f.value)}
            className={`rounded-full px-3 py-1 ${filter === f.value ? "bg-blue-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Producto</th>
              <th className="hidden px-4 py-2 font-medium sm:table-cell">Código</th>
              <th className="px-4 py-2 text-right font-medium">Existencia</th>
              <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Mínimo</th>
              <th className="px-4 py-2 font-medium">Alerta</th>
              {canMove && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((r) => {
              const unit = UNIT_LABELS[r.unit].short;
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <Link href={`/productos/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <span className="block text-xs text-neutral-500">
                      {r.sku}
                      {r.category ? ` · ${r.category}` : ""}
                    </span>
                  </td>
                  <td className="hidden px-4 py-2 font-mono text-xs sm:table-cell">{r.barcode ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-semibold whitespace-nowrap">
                    {qty(r.quantity)} {unit}
                  </td>
                  <td className="hidden px-4 py-2 text-right whitespace-nowrap text-neutral-500 sm:table-cell">{qty(r.minStock)}</td>
                  <td className="px-4 py-2">
                    <StockBadge quantity={r.quantity} minStock={r.minStock} />
                  </td>
                  {canMove && (
                    <td className="px-4 py-2 text-right">
                      <Link href={`/inventario/movimiento?producto=${r.id}`} className="btn-secondary px-3 py-1">
                        Mover
                      </Link>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  {q ? `Ningún producto coincide con "${q}".` : filter === "todos" ? "Aún no hay productos con control de existencias." : "¡Nada por aquí! 🎉"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} params={{ q, ver: filter === "todos" ? undefined : filter }} />
    </main>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: string; tone?: "amber" | "red"; href?: string }) {
  const color = tone === "amber" ? "text-amber-600" : tone === "red" ? "text-red-600" : "";
  const body = (
    <>
      <span className="block text-xs text-neutral-500">{label}</span>
      <span className={`text-xl font-semibold ${color}`}>{value}</span>
    </>
  );
  const cls = "block rounded-lg border border-neutral-200 p-3 dark:border-neutral-800";
  return href ? (
    <Link href={href} className={`${cls} hover:border-blue-500`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
