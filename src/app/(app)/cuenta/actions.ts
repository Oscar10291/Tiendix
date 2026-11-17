"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deleteUserSessions, requireSession } from "@/lib/auth/session";
import { passwordSchema } from "@/lib/validation";

export type PasswordState = { error?: string; ok?: boolean };

const schema = z
  .object({
    current: z.string().min(1, "Escribe tu contraseña actual."),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Las contraseñas nuevas no coinciden." });

export async function changeOwnPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await requireSession();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) {
    return { error: "La contraseña actual no es correcta." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });
  // Por seguridad, cierra la sesión en los demás dispositivos
  await deleteUserSessions(user.id, session.sessionId);
  return { ok: true };
}
