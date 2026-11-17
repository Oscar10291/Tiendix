import type { Role } from "@prisma/client";

// Lista de permisos del sistema. Para proteger una pantalla o acción nueva,
// agrega aquí el permiso y asígnalo a los roles que corresponda.
export const PERMISSIONS = [
  "pos:use", // cobrar en caja
  "sales:view", // ver ventas
  "products:view",
  "products:manage", // crear/editar productos, precios y códigos
  "inventory:view",
  "inventory:manage", // ajustes y traslados de stock
  "purchases:manage", // proveedores y compras
  "reports:view",
  "users:manage", // usuarios y roles
  "branches:manage", // sucursales
  "branches:all", // acceso a todas las sucursales sin asignación
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER: [
    "pos:use",
    "sales:view",
    "products:view",
    "products:manage",
    "inventory:view",
    "inventory:manage",
    "purchases:manage",
    "reports:view",
  ],
  CASHIER: ["pos:use", "products:view"],
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  CASHIER: "Cajero",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Acceso total, incluidas sucursales y usuarios.",
  MANAGER: "Inventario, productos, compras, ventas y reportes de sus sucursales.",
  CASHIER: "Solo caja (cobrar) y consulta de productos en sus sucursales.",
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
