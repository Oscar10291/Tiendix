import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { can, ROLE_LABELS, type Permission } from "@/lib/auth/permissions";
import { getStockSummary } from "@/lib/inventory/queries";
import { getDashboard, getMyDay } from "@/lib/reports/dashboard";
import { dateTime, money, qty } from "@/lib/format";
import { BarChart, StatCards } from "@/components/report-view";

const modules: { name: string; description: string; permission: Permission; href?: string }[] = [
  { name: "Caja (POS)", description: "Cobro en efectivo con lector de códigos, descuentos, ticket y cierre de caja.", permission: "pos:use", href: "/caja" },
  { name: "Ventas", description: "Ventas del día, reimpresión de tickets, anulaciones y cortes de caja.", permission: "pos:use", href: "/ventas" },
  { name: "Productos", description: "Catálogo, categorías, precios y códigos de barras.", permission: "products:view", href: "/productos" },
  { name: "Inventario", description: "Existencias por sucursal, ajustes, traslados y kárdex.", permission: "inventory:view", href: "/inventario" },
  { name: "Compras", description: "Proveedores, órdenes de compra, recepción de mercadería y costo promedio.", permission: "purchases:manage", href: "/compras" },
  { name: "Reportes", description: "Ventas, utilidad, productos más vendidos, inventario, cortes y compras. Excel y PDF.", permission: "reports:view", href: "/reportes" },
  { name: "Usuarios", description: "Crear usuarios, asignar rol y sucursales.", permission: "users:manage", href: "/admin/usuarios" },
];

export default async function Home() {
  const { user, branch } = await requireSession();
  const visible = modules.filter((m) => can(user.role, m.permission));
  const showDashboard = !!branch && can(user.role, "reports:view");
  const [stock, dash, myDay] = await Promise.all([
    branch && can(user.role, "inventory:view") ? getStockSummary(branch.id) : null,
    showDashboard ? getDashboard(branch.id) : null,
    branch && !showDashboard && can(user.role, "pos:use") ? getMyDay(user.id, branch.id) : null,
  ]);

  return (
    <main>
      <h1 className="text-2xl font-bold">Hola, {user.name.split(" ")[0]}</h1>
      <p className="mt-1 text-neutral-600 dark:text-neutral-400">
        {ROLE_LABELS[user.role]}
        {branch ? ` · ${branch.name}` : ""}
      </p>
      {stock && stock.low > 0 && (
        <Link
          href="/inventario?ver=bajo"
          className="mt-6 block rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:border-amber-500 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          ⚠️ {stock.low} {stock.low === 1 ? "producto tiene" : "productos tienen"} stock bajo en {branch!.name}
          {stock.out > 0 && ` (${stock.out} sin existencia)`}. Ver lista →
        </Link>
      )}
      {dash && <Dashboard data={dash} />}
      {myDay && (
        <p className="mt-6 rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
          Hoy llevas <strong>{myDay.count}</strong> {myDay.count === 1 ? "venta" : "ventas"} por <strong>{money(myDay.total)}</strong>.{" "}
          <Link href="/ventas" className="text-blue-600 hover:underline">
            Ver mis ventas →
          </Link>
        </p>
      )}
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m) => {
          const body = (
            <>
              <h2 className="font-semibold">{m.name}</h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{m.description}</p>
              {!m.href && <span className="mt-3 inline-block text-xs text-neutral-500">Próximamente</span>}
            </>
          );
          return (
            <li key={m.name}>
              {m.href ? (
                <Link href={m.href} className="block h-full rounded-lg border border-neutral-200 p-4 hover:border-blue-500 dark:border-neutral-800">
                  {body}
                </Link>
              ) : (
                <div className="h-full rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function Dashboard({ data }: { data: Awaited<ReturnType<typeof getDashboard>> }) {
  const { today } = data;
  const vs = today.vsYesterday;
  return (
    <section className="mt-6 space-y-4" aria-label="Números del día">
      <StatCards
        stats={[
          {
            label: "Vendido hoy",
            value: today.total,
            kind: "money",
            hint: vs === null ? (today.yesterdaySoFar === 0 ? "ayer a esta hora: sin ventas" : undefined) : `${vs > 0 ? "+" : ""}${Math.round(vs * 100)} % vs. ayer a esta hora`,
            tone: vs !== null && vs < 0 ? "amber" : undefined,
          },
          { label: "Ventas", value: today.count, kind: "int", hint: today.cancelled ? `${today.cancelled} anulada${today.cancelled === 1 ? "" : "s"} hoy` : undefined },
          { label: "Ticket promedio", value: today.avg, kind: "money" },
          {
            label: "Utilidad bruta",
            value: today.profit,
            kind: "money",
            hint: today.margin !== null ? `Margen ${Math.round(today.margin * 1000) / 10} %` : undefined,
            tone: today.profit < 0 ? "red" : undefined,
          },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BarChart title="Últimos 7 días" valueLabel="Vendido" secondaryLabel="Utilidad bruta" bars={data.week} />
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h2 className="font-semibold">Más vendidos hoy</h2>
            {data.top.length === 0 ? (
              <p className="mt-2 text-neutral-500">Todavía no hay ventas hoy.</p>
            ) : (
              <ol className="mt-2 space-y-1">
                {data.top.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <Link href={`/productos/${p.id}`} className="truncate hover:underline">
                      {p.name}
                    </Link>
                    <span className="shrink-0 tabular-nums text-neutral-600 dark:text-neutral-400">
                      {qty(p.qty)} · {money(p.revenue)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h2 className="font-semibold">Cajas abiertas</h2>
            {data.openCash.length === 0 ? (
              <p className="mt-2 text-neutral-500">Ninguna.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {data.openCash.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <Link href={`/caja/cortes/${c.id}`} className="truncate hover:underline">
                      #{c.number} {c.user}
                    </Link>
                    <span className="shrink-0 tabular-nums text-neutral-600 dark:text-neutral-400" title={`Abierta ${dateTime(c.openedAt)}`}>
                      {c.sales} · {money(c.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.purchases.pending > 0 && (
              <p className="mt-3 border-t border-neutral-200 pt-2 dark:border-neutral-800">
                <Link href="/compras" className="hover:underline">
                  {data.purchases.pending} {data.purchases.pending === 1 ? "compra por recibir" : "compras por recibir"}
                </Link>
                {data.purchases.overdue > 0 && <span className="text-red-600"> ({data.purchases.overdue} atrasada{data.purchases.overdue === 1 ? "" : "s"})</span>}
              </p>
            )}
          </div>
        </div>
      </div>
      <p className="text-sm">
        <Link href="/reportes" className="text-blue-600 hover:underline">
          Ver todos los reportes →
        </Link>
      </p>
    </section>
  );
}
