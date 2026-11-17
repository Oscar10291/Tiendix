"use client";

/** Botón para imprimir la página actual (el menú y los botones no salen en papel). */
export function PrintPageButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary print:hidden">
      {label}
    </button>
  );
}
