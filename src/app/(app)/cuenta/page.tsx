import { requireSession } from "@/lib/auth/session";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const { user, availableBranches } = await requireSession();

  return (
    <main className="max-w-lg">
      <h1 className="text-2xl font-bold">Mi cuenta</h1>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-neutral-500">Nombre</dt>
        <dd>{user.name}</dd>
        <dt className="text-neutral-500">Correo</dt>
        <dd>{user.email}</dd>
        <dt className="text-neutral-500">Rol</dt>
        <dd>
          {ROLE_LABELS[user.role]}
          <span className="block text-neutral-500">{ROLE_DESCRIPTIONS[user.role]}</span>
        </dd>
        <dt className="text-neutral-500">Sucursales</dt>
        <dd>{availableBranches.map((b) => b.name).join(", ") || "Ninguna"}</dd>
      </dl>

      <h2 className="mt-10 text-lg font-semibold">Cambiar contraseña</h2>
      <PasswordForm />
    </main>
  );
}
