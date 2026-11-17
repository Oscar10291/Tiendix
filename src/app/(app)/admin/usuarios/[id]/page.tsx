import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { ROLE_OPTIONS } from "@/lib/roles";
import { saveUser } from "../actions";
import { UserForm } from "../user-form";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("users:manage");
  const { id } = await params;

  const [user, branches] = await Promise.all([
    prisma.user.findUnique({ where: { id }, include: { branches: true } }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!user) notFound();

  return (
    <main>
      <h1 className="text-2xl font-bold">Editar usuario</h1>
      <p className="mt-1 text-sm text-neutral-500">{user.email}</p>
      <UserForm
        action={saveUser.bind(null, user.id)}
        branches={branches}
        roles={ROLE_OPTIONS}
        isSelf={user.id === session.user.id}
        user={{
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          branchIds: user.branches.map((b) => b.branchId),
        }}
      />
    </main>
  );
}
