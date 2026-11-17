"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { clearFailures, isBlocked, registerFailure } from "@/lib/auth/rate-limit";

export type LoginState = { error?: string; email?: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

// Hash de relleno: si el correo no existe igual comparamos contra algo,
// para que la respuesta tarde lo mismo y no revele qué correos existen.
const DUMMY_HASH = "$2b$10$h8ahvLfAGon4S8UaQBh3Fu.Zc2m8yBS5BQyoXoOy3vKHR4XNGOM76";

/** Solo permite volver a rutas internas (evita redirecciones a otros sitios). */
function safeNext(next: FormDataEntryValue | null) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: "Escribe un correo válido y tu contraseña.", email };

  const key = parsed.data.email;
  if (isBlocked(key)) {
    return { error: "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.", email };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { branches: { include: { branch: true }, orderBy: { branch: { name: "asc" } } } },
  });
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    registerFailure(key);
    return { error: "Correo o contraseña incorrectos.", email };
  }
  if (!user.active) {
    return { error: "Tu usuario está desactivado. Habla con un administrador.", email };
  }
  clearFailures(key);

  // Sucursal inicial: la primera activa asignada (o cualquiera si es admin)
  let branchId = user.branches.find((b) => b.branch.active)?.branchId ?? null;
  if (!branchId && can(user.role, "branches:all")) {
    const first = await prisma.branch.findFirst({ where: { active: true }, orderBy: { name: "asc" } });
    branchId = first?.id ?? null;
  }

  await createSession(user.id, branchId);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  redirect(safeNext(formData.get("next")));
}
