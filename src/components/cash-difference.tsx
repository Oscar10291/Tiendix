import { money } from "@/lib/format";

/** Diferencia del arqueo: "Cuadra", "Sobran Q…" o "Faltan Q…". */
export function CashDifference({ value }: { value: { toString(): string } }) {
  const n = Number(value.toString());
  if (n === 0) return <span className="text-green-700 dark:text-green-400">Cuadra</span>;
  return <span className={n > 0 ? "text-amber-700 dark:text-amber-400" : "text-red-600"}>{n > 0 ? `Sobran ${money(n)}` : `Faltan ${money(-n)}`}</span>;
}
