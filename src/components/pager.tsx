import Link from "next/link";

/** Botones Anterior / Siguiente que conservan los filtros de la URL. */
export function Pager({ page, pageSize, total, params }: { page: number; pageSize: number; total: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("pagina", String(p));
    return `?${sp.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm">
      <span className="text-neutral-500">
        Página {page} de {pages} · {total} en total
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} className="btn-secondary px-3 py-1">
            ← Anterior
          </Link>
        )}
        {page < pages && (
          <Link href={href(page + 1)} className="btn-secondary px-3 py-1">
            Siguiente →
          </Link>
        )}
      </span>
    </nav>
  );
}

/** Lee ?pagina= de forma segura. */
export const pageParam = (v: string | undefined) => Math.max(1, Math.floor(Number(v)) || 1);
