import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { can, ROLE_LABELS, type Permission } from "@/lib/auth/permissions";

const modules: { name: string; description: string; permission: Permission; href?: string }[] = [
  { name: "Caja (POS)", description: "Cobro rápido con lector de códigos de barras o cámara.", permission: "pos:use" },
  { name: "Productos", description: "Catálogo, categorías, precios y códigos de barras.", permission: "products:view" },
  { name: "Inventario", description: "Existencias por sucursal, ajustes, traslados y kárdex.", permission: "inventory:view" },
  { name: "Compras", description: "Proveedores, órdenes de compra y recepción de mercadería.", permission: "purchases:manage" },
  { name: "Reportes", description: "Ventas, márgenes, stock bajo y movimientos.", permission: "reports:view" },
  { name: "Usuarios", description: "Crear usuarios, asignar rol y sucursales.", permission: "users:manage", href: "/admin/usuarios" },
];

export default async function Home() {
  const { user, branch } = await requireSession();
  const visible = modules.filter((m) => can(user.role, m.permission));

  return (
    <main>
      <h1 className="text-2xl font-bold">Hola, {user.name.split(" ")[0]}</h1>
      <p className="mt-1 text-neutral-600 dark:text-neutral-400">
        {ROLE_LABELS[user.role]}
        {branch ? ` · ${branch.name}` : ""}
      </p>
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
