"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { deleteCurrentSession, getSession } from "./session";

export async function logout() {
  await deleteCurrentSession();
  redirect("/login");
}

/** Cambia la sucursal activa de la sesión (solo a una que el usuario tenga asignada). */
export async function switchBranch(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const branchId = String(formData.get("branchId") ?? "");
  if (!session.availableBranches.some((b) => b.id === branchId)) return;

  await prisma.session.update({ where: { id: session.sessionId }, data: { branchId } });
  revalidatePath("/", "layout");
}
