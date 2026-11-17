import Link from "next/link";
import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { setUserActive } from "./actions";

const MESSAGES: Record<string, { text: string; kind: "ok" | "error" }> = {
  creado: { text: "Usuario creado.", kind: "ok" },
  editado: { text: "Cambios guardados.", kind: "ok" },
  propio: { text: "No puedes desactivarte a ti mismo.", kind: "error" },
  "ultimo-admin": { text: "Debe quedar al menos un administrador activo.", kind: "error" },
};

const dateFmt = new Intl.DateTimeFormat("es-GT", { dateStyle: "short", timeStyle: "short", timeZone: "America/Guatemala" });

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rol?: string; estado?: string; ok?: string; error?: string }>;
}) {
  const session = await requirePermission("users:manage");
  const { q, rol, estado, ok, error } = await searchParams;
  const message = MESSAGES[ok ?? error ?? ""];

  const where: Prisma.UserWhereInput = {};
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
  if (rol && rol in Role) where.role = rol as Role;
  if (estado === "activos") where.active = true;
  if (estado === "inactivos") where.active = false;

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { branches: { include: { branch: { select: { name: true } } } } },
  });

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Link href="/admin/usuarios/nuevo" className="btn-primary">
          + Nuevo usuario
        </Link>
      </div>

      {message && (
        <p
          role="status"
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}

      <form className="mt-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre o correo" className="input max-w-xs" />
        <select name="rol" defaultValue={rol ?? ""} className="input w-auto">
          <option value="">Todos los roles</option>
          {Object.values(Role).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={estado ?? ""} className="input w-auto">
          <option value="">Activos e inactivos</option>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
        </select>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Sucursales</th>
              <th className="px-4 py-2 font-medium">Último acceso</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-neutral-400"}>
                <td className="px-4 py-2">
                  <span className="block font-medium">{u.name}</span>
                  <span className="block text-xs text-neutral-500">{u.email}</span>
                </td>
                <td className="px-4 py-2">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-2">
                  {u.role === Role.ADMIN ? "Todas" : u.branches.map((b) => b.branch.name).join(", ") || "—"}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{u.lastLoginAt ? dateFmt.format(u.lastLoginAt) : "Nunca"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.active ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800"
                    }`}
                  >
                    {u.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <Link href={`/admin/usuarios/${u.id}`} className="btn-secondary px-3 py-1">
                      Editar
                    </Link>
                    {u.id !== session.user.id && (
                      <form action={setUserActive.bind(null, u.id, !u.active)}>
                        <button className="btn-secondary px-3 py-1">{u.active ? "Desactivar" : "Activar"}</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No hay usuarios que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
