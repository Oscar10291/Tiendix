import Link from "next/link";

export default function NoPermissionPage() {
  return (
    <main className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold">Sin permiso</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Tu rol no tiene acceso a esta sección. Si crees que es un error, habla con un administrador.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Volver al inicio
      </Link>
    </main>
  );
}
