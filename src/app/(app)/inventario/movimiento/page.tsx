import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getProductOption } from "../actions";
import { MovementForm } from "./movement-form";

export default async function MovementPage({ searchParams }: { searchParams: Promise<{ producto?: string }> }) {
  const { branch } = await requirePermission("inventory:manage");
  const { producto } = await searchParams;

  return (
    <main>
      <p className="text-sm">
        <Link href="/inventario" className="text-blue-600 hover:underline">
          ← Inventario
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">Entradas, salidas y ajustes</h1>
      {branch ? (
        <>
          <p className="text-sm text-neutral-500">
            Sucursal: <strong>{branch.name}</strong> (cámbiala arriba a la derecha)
          </p>
          <MovementForm key={producto ?? ""} branchName={branch.name} initialProduct={producto ? await getProductOption(producto) : null} />
        </>
      ) : (
        <p className="mt-4 text-neutral-600">No tienes una sucursal asignada. Pide a un administrador que te asigne una.</p>
      )}
    </main>
  );
}
