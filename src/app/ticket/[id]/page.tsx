import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { dateTime, money, qty } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/inventory/reasons";
import { canAccessSale } from "@/lib/pos/cash";
import { AutoPrint } from "./auto-print";

export const metadata = { title: "Ticket · Tiendix" };

/**
 * Ticket de venta para impresora térmica de 80 mm (también sale bien en hoja carta).
 * Está fuera del menú de la app para que solo se imprima el ticket.
 * La caja lo carga en un iframe invisible; ?imprimir=1 lo imprime al abrirlo directamente.
 */
export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imprimir?: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { imprimir } = await searchParams;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { name: true, unit: true } } } },
      payments: true,
      user: { select: { name: true } },
      branch: true,
    },
  });
  if (!sale || !canAccessSale(session, sale)) notFound();

  const cash = sale.payments.find((p) => p.method === "CASH");
  const lineDiscounts = sale.items.reduce((s, i) => s + Number(i.discount), 0);

  return (
    <div className="ticket">
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        html, body { background: #fff !important; color: #000 !important; }
        .ticket { width: 72mm; margin: 0 auto; padding: 4mm 0; font: 12px/1.35 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #000; }
        .ticket h1 { font-size: 15px; font-weight: 700; text-align: center; }
        .ticket .c { text-align: center; }
        .ticket .row { display: flex; justify-content: space-between; gap: 8px; }
        .ticket .sep { border-top: 1px dashed #000; margin: 6px 0; }
        .ticket .big { font-size: 15px; font-weight: 700; }
        .ticket .void { border: 2px solid #000; text-align: center; font-weight: 700; font-size: 16px; margin: 6px 0; padding: 2px; }
        .ticket .btn { display: block; margin: 12px auto 0; padding: 6px 12px; border: 1px solid #999; border-radius: 6px; font: inherit; cursor: pointer; }
        @media print { .ticket .btn { display: none; } }
      `}</style>

      <h1>{sale.branch.name}</h1>
      {sale.branch.address && <p className="c">{sale.branch.address}</p>}
      {sale.branch.phone && <p className="c">Tel. {sale.branch.phone}</p>}
      <div className="sep" />
      <div className="row">
        <span>Venta #{sale.number}</span>
        <span>{dateTime(sale.createdAt)}</span>
      </div>
      <p>Cajero: {sale.user.name}</p>
      {sale.status === "CANCELLED" && <p className="void">*** VENTA ANULADA ***</p>}
      <div className="sep" />

      {sale.items.map((i) => (
        <div key={i.id} style={{ marginBottom: 3 }}>
          <p>{i.product.name}</p>
          <div className="row">
            <span>
              {qty(i.quantity)} {UNIT_LABELS[i.product.unit].short} × {money(i.unitPrice)}
            </span>
            <span>{money(i.total.plus(i.discount))}</span>
          </div>
          {Number(i.discount) > 0 && (
            <div className="row">
              <span>&nbsp;&nbsp;Descuento</span>
              <span>−{money(i.discount)}</span>
            </div>
          )}
        </div>
      ))}

      <div className="sep" />
      {(lineDiscounts > 0 || Number(sale.discount) > 0) && (
        <div className="row">
          <span>Subtotal</span>
          <span>{money(sale.subtotal)}</span>
        </div>
      )}
      {Number(sale.discount) > 0 && (
        <div className="row">
          <span>Descuento</span>
          <span>−{money(sale.discount)}</span>
        </div>
      )}
      <div className="row big">
        <span>TOTAL</span>
        <span>{money(sale.total)}</span>
      </div>
      {cash && (
        <>
          <div className="row">
            <span>Efectivo</span>
            <span>{money(cash.tendered ?? cash.amount)}</span>
          </div>
          <div className="row">
            <span>Cambio</span>
            <span>{money(cash.change ?? 0)}</span>
          </div>
        </>
      )}
      <div className="row" style={{ fontSize: 11 }}>
        <span>IVA incluido</span>
        <span>{money(sale.tax)}</span>
      </div>
      {(lineDiscounts > 0 || Number(sale.discount) > 0) && (
        <p className="c" style={{ marginTop: 4 }}>
          Usted ahorró {money(lineDiscounts + Number(sale.discount))}
        </p>
      )}
      <div className="sep" />
      <p className="c">¡Gracias por su compra!</p>
      <p className="c" style={{ fontSize: 10 }}>
        Comprobante interno, no es factura
      </p>
      <AutoPrint enabled={imprimir === "1"} />
    </div>
  );
}
