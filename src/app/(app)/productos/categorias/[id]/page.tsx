import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { descendantIds, getCategoryTree } from "@/lib/categories";
import { saveCategory } from "../actions";
import { CategoryForm } from "../category-form";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("products:manage");
  const { id } = await params;

  const tree = await getCategoryTree();
  const category = tree.find((c) => c.id === id);
  if (!category) notFound();

  // No se puede mover dentro de sí misma ni de sus subcategorías
  const blocked = new Set(descendantIds(tree, id));
  const parents = tree.filter((c) => !blocked.has(c.id) && (c.active || c.id === category.parentId));

  return (
    <main>
      <h1 className="text-2xl font-bold">Editar categoría</h1>
      <p className="mt-1 text-sm text-neutral-500">{category.path}</p>
      <CategoryForm
        action={saveCategory.bind(null, id)}
        parents={parents}
        category={{ name: category.name, parentId: category.parentId ?? "", active: category.active }}
      />
    </main>
  );
}
