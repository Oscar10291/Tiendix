import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { REPORTS } from "@/lib/reports/types";

export const metadata = { title: "Reportes · Tiendix" };

export default async function ReportsIndex() {
  await requirePermission("reports:view");
  return (
    <main>
      <h1 className="text-2xl font-bold">Reportes</h1>
      <p className="mt-1 text-sm text-neutral-500">Cada reporte se puede filtrar por sucursal y fechas, descargar en Excel o imprimir / guardar como PDF.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <li key={r.key}>
            <Link href={`/reportes/${r.key}`} className="block h-full rounded-lg border border-neutral-200 p-4 hover:border-blue-500 dark:border-neutral-800">
              <h2 className="font-semibold">{r.title}</h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{r.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
