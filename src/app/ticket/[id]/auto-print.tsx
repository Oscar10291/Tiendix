"use client";

import { useEffect } from "react";

/** Botón "Imprimir" (no sale en papel) y, si se pide, abre el diálogo al cargar. */
export function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) window.print();
  }, [enabled]);
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}
