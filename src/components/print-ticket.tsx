"use client";

/**
 * Imprime el ticket de una venta sin salir de la pantalla: lo carga en un
 * iframe invisible y abre el diálogo de impresión del navegador.
 * Para impresoras térmicas de 80 mm, elige la impresora y "Márgenes: ninguno".
 */
export function printTicket(saleId: string) {
  document.getElementById("ticket-frame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "ticket-frame";
  frame.title = "Ticket";
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = `/ticket/${saleId}`;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  };
  document.body.appendChild(frame);
}

export function PrintTicketButton({ saleId, className }: { saleId: string; className?: string }) {
  return (
    <button type="button" onClick={() => printTicket(saleId)} className={className ?? "btn-secondary"}>
      Imprimir ticket
    </button>
  );
}
