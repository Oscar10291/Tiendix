import { Role } from "@prisma/client";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";

/** Roles en el orden en que se muestran en formularios. */
export const ROLE_OPTIONS = [Role.CASHIER, Role.MANAGER, Role.ADMIN].map((value) => ({
  value,
  label: ROLE_LABELS[value],
  description: ROLE_DESCRIPTIONS[value],
}));
