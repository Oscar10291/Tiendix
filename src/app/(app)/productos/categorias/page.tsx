import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getCategoryTree } from "@/lib/categories";
import { Badge, Flash } from "@/components/flash";
import { saveCategory, setCategoryActive } from "./actions";
import { CategoryForm } from "./category-form";

const MESSAGES: Record<string, string> = { creada: "Categoría creada.", editada: "Cambios guardados." };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { user } = await requirePermission("products:view");
  const canManage = can(user.role, "products:manage");
  const { ok } = await searchParams;

  const [tree, counts] = await Promise.all([
    getCategoryTree(),
    prisma.product.groupBy({ by: ["categoryId"], where: { active: true }, _count: true }),
  ]);
  const countBy = new Map(counts.map((c) => [c.categoryId, c._count]));

  return (
    <main>
      <p className="text-sm">
        <Link href="/productos" className="text-blue-600 hover:underline">
          ← Productos
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">Categorías</h1>
      {ok && MESSAGES[ok] && <Flash kind="ok">{MESSAGES[ok]}</Flash>}

      {canManage && (
        <section className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-semibold">Nueva categoría</h2>
          <CategoryForm action={saveCategory.bind(null, null)} parents={tree.filter((c) => c.active)} inline />
        </section>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Productos activos</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              {canManage && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {tree.map((c) => (
              <tr key={c.id} className={c.active ? "" : "text-neutral-400"}>
                <td className="px-4 py-2" style={{ paddingLeft: `${1 + c.depth * 1.5}rem` }}>
                  {c.depth > 0 && <span className="mr-1 text-neutral-400">└</span>}
                  <Link href={`/productos?categoria=${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{countBy.get(c.id) ?? 0}</td>
                <td className="px-4 py-2">{c.active ? <Badge tone="green">Activa</Badge> : <Badge tone="gray">Inactiva</Badge>}</td>
                {canManage && (
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <Link href={`/productos/categorias/${c.id}`} className="btn-secondary px-3 py-1">
                        Editar
                      </Link>
                      <form action={setCategoryActive.bind(null, c.id, !c.active)}>
                        <button className="btn-secondary px-3 py-1">{c.active ? "Desactivar" : "Activar"}</button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {tree.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  Aún no hay categorías.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Desactivar una categoría no borra ni oculta sus productos; solo deja de ofrecerse al crear o editar productos.
      </p>
    </main>
  );
}
