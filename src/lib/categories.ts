import { prisma } from "@/lib/prisma";

export type CategoryNode = { id: string; name: string; parentId: string | null; active: boolean; depth: number; path: string };

/**
 * Todas las categorías en orden de árbol (cada una seguida de sus subcategorías),
 * con su profundidad y su ruta completa ("Bebidas › Gaseosas").
 */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  const all = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const byParent = new Map<string | null, typeof all>();
  for (const c of all) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }

  const result: CategoryNode[] = [];
  const seen = new Set<string>();
  function walk(parentId: string | null, depth: number, prefix: string) {
    for (const c of byParent.get(parentId) ?? []) {
      if (seen.has(c.id)) continue; // protección ante ciclos
      seen.add(c.id);
      const path = prefix ? `${prefix} › ${c.name}` : c.name;
      result.push({ id: c.id, name: c.name, parentId: c.parentId, active: c.active, depth, path });
      walk(c.id, depth + 1, path);
    }
  }
  walk(null, 0, "");
  return result;
}

/** Ids de una categoría y todas sus subcategorías (para filtrar productos o evitar ciclos). */
export function descendantIds(tree: CategoryNode[], id: string): string[] {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    for (const c of tree) if (c.parentId === ids[i]) ids.push(c.id);
  }
  return ids;
}
