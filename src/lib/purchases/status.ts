// Estados de una orden de compra. Se usa en el servidor y en el navegador.

export const PURCHASE_STATUS: Record<string, { label: string; tone: "gray" | "blue" | "green" | "red"; help: string }> = {
  DRAFT: { label: "Borrador", tone: "gray", help: "En preparación; todavía no se ha enviado al proveedor." },
  ORDERED: { label: "Enviada", tone: "blue", help: "Pedida al proveedor; esperando la mercadería." },
  RECEIVED: { label: "Recibida", tone: "green", help: "La mercadería entró al inventario." },
  CANCELLED: { label: "Cancelada", tone: "red", help: "No se recibirá." },
};

/** Estados en los que la orden todavía se puede editar, recibir o cancelar. */
export const OPEN_STATUSES = ["DRAFT", "ORDERED"] as const;
export const isOpen = (status: string) => (OPEN_STATUSES as readonly string[]).includes(status);
