import { z } from "zod";

/**
 * Convierte lo escrito en un campo numérico a texto decimal ("12,5" → "12.5").
 * Devuelve null si está vacío.
 */
export function normalizeDecimal(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return text === "" ? null : text;
}

/** Esquema zod para un decimal con un máximo de decimales, p. ej. dinero (2) o cantidades (3). */
export function decimalSchema(opts: { decimals: number; min?: number; max?: number; label: string; positive?: boolean }) {
  const { decimals, min = 0, max = 9_999_999, label, positive } = opts;
  const pattern = new RegExp(`^-?\\d+(\\.\\d{1,${decimals}})?$`);
  return z
    .string(`Escribe ${label}.`)
    .min(1, `Escribe ${label}.`)
    .regex(pattern, `${capitalize(label)}: número con máximo ${decimals} decimales.`)
    .refine((v) => Number(v) >= min && Number(v) <= max, `${capitalize(label)} fuera de rango.`)
    .refine((v) => !positive || Number(v) > 0, `${capitalize(label)} debe ser mayor que cero.`);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
