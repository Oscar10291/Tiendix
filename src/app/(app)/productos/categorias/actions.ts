"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { descendantIds, getCategoryTree } from "@/lib/categories";

export type CategoryFormState = { error?: string; values?: { name: string; parentId: string; active: boolean } };

const schema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la categoría.").max(60, "Nombre demasiado largo."),
  parentId: z.string(),
  active: z.boolean(),
});

/** Crea (id = null) o edita una categoría. */
export async function saveCategory(id: string | null, _prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  await requirePermission("products:manage");

  const raw = {
    name: String(formData.get("name") ?? ""),
    parentId: String(formData.get("parentId") ?? ""),
    active: id ? formData.get("active") === "on" : true,
  };
  const fail = (error: string): CategoryFormState => ({ error, values: raw });

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { name, active } = parsed.data;
  const parentId = parsed.data.parentId || null;

  if (parentId) {
    const tree = await getCategoryTree();
    if (!tree.some((c) => c.id === parentId)) return fail("La categoría superior ya no existe.");
    if (id && descendantIds(tree, id).includes(parentId)) {
      return fail("Una categoría no puede quedar dentro de sí misma ni de una de sus subcategorías.");
    }
  }

  // Nombre repetido en el mismo nivel (se compara sin mayúsculas)
  const duplicate = await prisma.category.findFirst({
    where: { parentId, name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
  });
  if (duplicate) return fail(`Ya existe la categoría "${duplicate.name}" en ese nivel.`);

  if (id) {
    await prisma.category.update({ where: { id }, data: { name, parentId, active } });
  } else {
    await prisma.category.create({ data: { name, parentId } });
  }

  revalidatePath("/productos/categorias");
  redirect(`/productos/categorias?ok=${id ? "editada" : "creada"}`);
}

/** Activa o desactiva una categoría desde la lista. Los productos no se tocan. */
export async function setCategoryActive(id: string, active: boolean) {
  await requirePermission("products:manage");
  await prisma.category.update({ where: { id }, data: { active } });
  revalidatePath("/productos/categorias");
}
