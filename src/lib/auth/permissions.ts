import type { Role } from "@prisma/client";

// Lista de permisos del sistema. Para proteger una pantalla o acción nueva,
// agrega aquí el permiso y asígnalo a los roles que corresponda.
export const PERMISSIONS = [
  "pos:use", // cobrar en caja
  "sales:view", // ver ventas y cortes de caja de todos los cajeros
  "sales:cancel", // anular ventas (devuelve el stock)
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
    "sales:cancel",
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
  MANAGER: "Inventario, productos, compras, ventas (incluida su anulación) y reportes de sus sucursales.",
  CASHIER: "Caja: abrir/cerrar su turno, cobrar y ver sus propias ventas; consulta de productos.",
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
