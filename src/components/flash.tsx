/** Mensaje de éxito o error que se muestra arriba de una página. */
export function Flash({ kind, children }: { kind: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`mt-4 rounded-md px-3 py-2 text-sm ${
        kind === "ok"
          ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
          : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      {children}
    </p>
  );
}

/** Etiqueta pequeña de estado (activo, stock bajo, etc.). */
export function Badge({ tone, children }: { tone: "green" | "gray" | "amber" | "red" | "blue"; children: React.ReactNode }) {
  const tones = {
    green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    gray: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}
