import { Badge } from "./flash";

type Num = { toString(): string } | number;

/** Estado de la existencia frente al mínimo: Sin stock / Stock bajo (nada si está bien). */
export function stockLevel(quantity: Num, minStock: Num): "out" | "low" | "ok" {
  const q = Number(quantity.toString());
  const min = Number(minStock.toString());
  if (q <= 0) return "out";
  if (min > 0 && q <= min) return "low";
  return "ok";
}

export function StockBadge({ quantity, minStock }: { quantity: Num; minStock: Num }) {
  const level = stockLevel(quantity, minStock);
  if (level === "out") return <Badge tone="red">Sin stock</Badge>;
  if (level === "low") return <Badge tone="amber">Stock bajo</Badge>;
  return null;
}
