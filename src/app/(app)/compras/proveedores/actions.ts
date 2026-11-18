"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";

export type SupplierFormValues = {
  name: string;
  taxId: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
};

export type SupplierFormState = { error?: string; values?: SupplierFormValues };

const optional = (max: number, label: string) => z.string().trim().max(max, `${label}: texto demasiado largo.`);

const schema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre del proveedor.").max(100, "Nombre demasiado largo."),
  taxId: optional(20, "NIT"),
  contactName: optional(80, "Contacto"),
  phone: optional(40, "Teléfono"),
  email: z
    .string()
    .trim()
    .max(120, "Correo demasiado largo.")
    .refine((v) => v === "" || z.email().safeParse(v).success, "El correo no es válido."),
  address: optional(200, "Dirección"),
  notes: optional(500, "Notas"),
  active: z.boolean(),
});

const orNull = (v: string) => (v === "" ? null : v);

/** Crea (id = null) o edita un proveedor. */
export async function saveSupplier(id: string | null, _prev: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  await requirePermission("purchases:manage");

  const raw: SupplierFormValues = {
    name: String(formData.get("name") ?? ""),
    taxId: String(formData.get("taxId") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    active: id ? formData.get("active") === "on" : true,
  };
  const fail = (error: string): SupplierFormState => ({ error, values: raw });

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const taxId = d.taxId.toUpperCase().replace(/\s/g, "");

  // Evita duplicados: mismo nombre o mismo NIT (sin contar "CF")
  const notSelf = id ? { id: { not: id } } : {};
  const sameName = await prisma.supplier.findFirst({ where: { name: { equals: d.name, mode: "insensitive" }, ...notSelf } });
  if (sameName) return fail(`Ya existe el proveedor "${sameName.name}".`);
  if (taxId && taxId !== "CF") {
    // Se compara sin guiones: "1234567-8" y "12345678" son el mismo NIT
    const bare = (v: string) => v.replace(/-/g, "");
    const others = await prisma.supplier.findMany({ where: { taxId: { not: null }, ...notSelf }, select: { name: true, taxId: true } });
    const sameTax = others.find((o) => bare(o.taxId!) === bare(taxId));
    if (sameTax) return fail(`El NIT ${taxId} ya lo tiene el proveedor "${sameTax.name}".`);
  }

  const data = {
    name: d.name,
    taxId: orNull(taxId),
    contactName: orNull(d.contactName),
    phone: orNull(d.phone),
    email: orNull(d.email.toLowerCase()),
    address: orNull(d.address),
    notes: orNull(d.notes),
    active: d.active,
  };
  const supplier = id ? await prisma.supplier.update({ where: { id }, data }) : await prisma.supplier.create({ data });

  revalidatePath("/compras/proveedores");
  redirect(`/compras/proveedores/${supplier.id}?ok=${id ? "editado" : "creado"}`);
}

/** Activa o desactiva un proveedor. Sus compras anteriores no se tocan. */
export async function setSupplierActive(id: string, active: boolean) {
  await requirePermission("purchases:manage");
  await prisma.supplier.update({ where: { id }, data: { active } });
  revalidatePath("/compras/proveedores");
  revalidatePath(`/compras/proveedores/${id}`);
}
