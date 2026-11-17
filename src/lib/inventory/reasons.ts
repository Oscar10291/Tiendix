// Tipos de movimiento manual y sus motivos. Se usa en el servidor y en el navegador,
// por eso aquí no se importa nada de Prisma.

export type ManualKind = "IN" | "OUT" | "ADJUST";

export const MANUAL_KINDS: { value: ManualKind; label: string; help: string }[] = [
  { value: "IN", label: "Entrada", help: "Suma unidades a la existencia." },
  { value: "OUT", label: "Salida", help: "Resta unidades (merma, daño, consumo…)." },
  { value: "ADJUST", label: "Ajuste por conteo", help: "Escribe cuánto hay en realidad; el sistema calcula la diferencia." },
];

export const REASONS: Record<ManualKind, { value: string; label: string }[]> = {
  IN: [
    { value: "INVENTARIO_INICIAL", label: "Inventario inicial" },
    { value: "COMPRA_DIRECTA", label: "Compra directa (sin orden de compra)" },
    { value: "DEVOLUCION_CLIENTE", label: "Devolución de cliente" },
    { value: "BONIFICACION", label: "Bonificación / regalo del proveedor" },
    { value: "OTRO", label: "Otro (explica en la nota)" },
  ],
  OUT: [
    { value: "MERMA", label: "Merma / vencido" },
    { value: "DANO", label: "Producto dañado" },
    { value: "CONSUMO_INTERNO", label: "Consumo interno" },
    { value: "ROBO", label: "Robo o extravío" },
    { value: "DEVOLUCION_PROVEEDOR", label: "Devolución al proveedor" },
    { value: "OTRO", label: "Otro (explica en la nota)" },
  ],
  ADJUST: [
    { value: "CONTEO_FISICO", label: "Conteo físico" },
    { value: "CORRECCION", label: "Corrección de un error" },
    { value: "OTRO", label: "Otro (explica en la nota)" },
  ],
};

// Motivos que pone el sistema (no se eligen a mano)
const SYSTEM_REASONS = [{ value: "ANULACION_VENTA", label: "Anulación de venta" }];

const ALL_REASONS = Object.fromEntries([...Object.values(REASONS).flat(), ...SYSTEM_REASONS].map((r) => [r.value, r.label]));

/** Texto legible de un motivo guardado en el kárdex. */
export function reasonLabel(value: string | null | undefined) {
  if (!value) return null;
  return ALL_REASONS[value]?.replace(" (explica en la nota)", "") ?? value;
}

/** Nombre de cada tipo de movimiento del kárdex. */
export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  INITIAL: "Carga inicial",
  PURCHASE: "Compra",
  SALE: "Venta",
  SALE_RETURN: "Devolución de cliente",
  PURCHASE_RETURN: "Devolución a proveedor",
  ADJUSTMENT: "Ajuste",
  TRANSFER_IN: "Traslado (entrada)",
  TRANSFER_OUT: "Traslado (salida)",
  MANUAL_IN: "Entrada manual",
  MANUAL_OUT: "Salida manual",
};

/** Unidades de medida con su abreviatura. */
export const UNIT_LABELS: Record<string, { label: string; short: string }> = {
  UNIT: { label: "Unidad", short: "u" },
  KG: { label: "Kilogramo", short: "kg" },
  G: { label: "Gramo", short: "g" },
  L: { label: "Litro", short: "L" },
  ML: { label: "Mililitro", short: "ml" },
  M: { label: "Metro", short: "m" },
  BOX: { label: "Caja / paquete", short: "cj" },
};
