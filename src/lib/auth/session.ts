import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "./permissions";
import { SESSION_COOKIE, SESSION_DURATION_MS } from "./constants";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Crea la sesión en la base de datos y guarda la cookie en el navegador. */
export async function createSession(userId: string, branchId: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 255) ?? null;

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, branchId, expiresAt, userAgent },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // JavaScript del navegador no puede leerla
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Cierra la sesión actual (borra la fila y la cookie). */
export async function deleteCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Devuelve la sesión actual con su usuario, o null si no hay sesión válida.
 * Se consulta una sola vez por petición gracias a `cache`.
 */
export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          branches: { select: { branch: true } },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt < new Date() || !session.user.active) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const { user } = session;
  const availableBranches = can(user.role, "branches:all")
    ? await prisma.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    : user.branches.map((b) => b.branch).filter((b) => b.active);

  return {
    sessionId: session.id,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    // Si le quitaron la sucursal activa (o se desactivó), usa la primera que tenga
    branch: availableBranches.find((b) => b.id === session.branchId) ?? availableBranches[0] ?? null,
    availableBranches,
  };
});

export type CurrentSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Exige sesión iniciada; si no hay, manda al login. */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Exige un permiso; si el rol no lo tiene, muestra la página "sin permiso". */
export async function requirePermission(permission: Permission): Promise<CurrentSession> {
  const session = await requireSession();
  if (!can(session.user.role, permission)) redirect("/sin-permiso");
  return session;
}

/** Cierra todas las sesiones de un usuario (al desactivarlo o cambiar su contraseña). */
export async function deleteUserSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}
