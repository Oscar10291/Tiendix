import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { ROLE_OPTIONS } from "@/lib/roles";
import { saveUser } from "../actions";
import { UserForm } from "../user-form";

export default async function NewUserPage() {
  await requirePermission("users:manage");
  const branches = await prisma.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  return (
    <main>
      <h1 className="text-2xl font-bold">Nuevo usuario</h1>
      <UserForm action={saveUser.bind(null, null)} branches={branches} roles={ROLE_OPTIONS} />
    </main>
  );
}
