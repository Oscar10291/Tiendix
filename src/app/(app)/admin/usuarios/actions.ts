"use server";

import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deleteUserSessions, requirePermission } from "@/lib/auth/session";
import { passwordSchema } from "@/lib/validation";

type FormValues = { name: string; email: string; role: Role; active: boolean; branchIds: string[] };

export type UserFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  // Lo que se escribió, para no perderlo cuando hay un error
  values?: FormValues;
};

const baseSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre.").max(100),
  email: z.string().trim().toLowerCase().pipe(z.email("Correo no válido.")),
  role: z.enum(Role, "Elige un rol."),
  active: z.boolean(),
  branchIds: z.array(z.string()),
  password: z.string(),
});

function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    active: formData.get("active") === "on",
    branchIds: formData.getAll("branchIds").map(String),
    password: String(formData.get("password") ?? ""),
  };
}

/** ¿Quedaría al menos otro administrador activo si este deja de serlo? */
async function hasOtherActiveAdmin(userId: string) {
  const count = await prisma.user.count({
    where: { role: Role.ADMIN, active: true, id: { not: userId } },
  });
  return count > 0;
}

/** Crea (id = null) o actualiza un usuario. */
export async function saveUser(id: string | null, _prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const session = await requirePermission("users:manage");

  const raw = readForm(formData);
  const values: FormValues = {
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    role: (Object.values(Role) as string[]).includes(String(raw.role)) ? (raw.role as Role) : Role.CASHIER,
    active: raw.active,
    branchIds: raw.branchIds,
  };
  const fail = (error: string, fieldErrors?: Record<string, string>): UserFormState => ({ error, fieldErrors, values });

  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return fail("Revisa los campos marcados.", fieldErrors);
  }
  const data = parsed.data;

  // Contraseña: obligatoria al crear; al editar, vacía = no cambiar
  if (!id || data.password) {
    const pw = passwordSchema.safeParse(data.password);
    if (!pw.success) return fail("Revisa los campos marcados.", { password: pw.error.issues[0].message });
  }

  // Sucursales: deben existir y estar activas; cajeros y gerentes necesitan al menos una
  const branchIds = [...new Set(data.branchIds)];
  const validBranches = await prisma.branch.count({ where: { id: { in: branchIds }, active: true } });
  if (validBranches !== branchIds.length) return fail("Alguna sucursal elegida no existe o está inactiva.");
  if (data.role !== Role.ADMIN && branchIds.length === 0) {
    return fail("Revisa los campos marcados.", { branchIds: "Asigna al menos una sucursal." });
  }

  if (id) {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return fail("El usuario ya no existe.");

    const losesAdmin = existing.role === Role.ADMIN && existing.active && (data.role !== Role.ADMIN || !data.active);
    if (losesAdmin) {
      if (id === session.user.id) {
        return fail("No puedes quitarte el rol de administrador ni desactivarte a ti mismo.");
      }
      if (!(await hasOtherActiveAdmin(id))) {
        return fail("Debe quedar al menos un administrador activo.");
      }
    }
  }

  const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;
  const fields = { name: data.name, email: data.email, role: data.role, active: data.active };

  try {
    if (id) {
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { ...fields, ...(passwordHash ? { passwordHash } : {}) } }),
        prisma.userBranch.deleteMany({ where: { userId: id } }),
        prisma.userBranch.createMany({ data: branchIds.map((branchId) => ({ userId: id, branchId })) }),
      ]);
      // Si se desactivó o se cambió su contraseña, cierra sus sesiones abiertas
      if (!data.active || passwordHash) {
        await deleteUserSessions(id, id === session.user.id ? session.sessionId : undefined);
      }
    } else {
      await prisma.user.create({
        data: {
          ...fields,
          passwordHash: passwordHash!,
          branches: { create: branchIds.map((branchId) => ({ branchId })) },
        },
      });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("Revisa los campos marcados.", { email: "Ya existe un usuario con ese correo." });
    }
    throw e;
  }

  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios?ok=${id ? "editado" : "creado"}`);
}

/** Activa o desactiva un usuario desde la lista. */
export async function setUserActive(id: string, active: boolean) {
  const session = await requirePermission("users:manage");

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return;
  if (!active && user.role === Role.ADMIN) {
    if (id === session.user.id) redirect("/admin/usuarios?error=propio");
    if (!(await hasOtherActiveAdmin(id))) redirect("/admin/usuarios?error=ultimo-admin");
  }

  await prisma.user.update({ where: { id }, data: { active } });
  if (!active) await deleteUserSessions(id);
  revalidatePath("/admin/usuarios");
}
