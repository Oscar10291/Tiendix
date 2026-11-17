import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { logout } from "@/lib/auth/actions";
import { BranchSwitcher } from "@/components/branch-switcher";

// Todas las páginas dentro de (app) exigen sesión iniciada.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, branch, availableBranches } = await requireSession();

  const nav = [
    { href: "/", label: "Inicio", show: true },
    { href: "/admin/usuarios", label: "Usuarios", show: can(user.role, "users:manage") },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-bold">
            Tiendix
          </Link>
          <nav className="flex gap-4 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
            <BranchSwitcher
              current={branch?.id ?? null}
              branches={availableBranches.map((b) => ({ id: b.id, name: b.name }))}
            />
            <Link href="/cuenta" className="text-right leading-tight hover:underline" title="Mi cuenta">
              <span className="block font-medium">{user.name}</span>
              <span className="block text-xs text-neutral-500">{ROLE_LABELS[user.role]}</span>
            </Link>
            <form action={logout}>
              <button type="submit" className="btn-secondary px-3 py-1.5">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
