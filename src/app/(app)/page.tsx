import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { can, ROLE_LABELS, type Permission } from "@/lib/auth/permissions";
import { getStockSummary } from "@/lib/inventory/queries";

const modules: { name: string; description: string; permission: Permission; href?: string }[] = [
  { name: "Caja (POS)", description: "Cobro rápido con lector de códigos de barras o cámara.", permission: "pos:use" },
  { name: "Productos", description: "Catálogo, categorías, precios y códigos de barras.", permission: "products:view", href: "/productos" },
  { name: "Inventario", description: "Existencias por sucursal, ajustes, traslados y kárdex.", permission: "inventory:view", href: "/inventario" },
  { name: "Compras", description: "Proveedores, órdenes de compra y recepción de mercadería.", permission: "purchases:manage" },
  { name: "Reportes", description: "Ventas, márgenes, stock bajo y movimientos.", permission: "reports:view" },
  { name: "Usuarios", description: "Crear usuarios, asignar rol y sucursales.", permission: "users:manage", href: "/admin/usuarios" },
];

export default async function Home() {
  const { user, branch } = await requireSession();
  const visible = modules.filter((m) => can(user.role, m.permission));
  const stock = branch && can(user.role, "inventory:view") ? await getStockSummary(branch.id) : null;

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
