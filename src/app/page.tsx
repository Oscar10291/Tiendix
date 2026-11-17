const modules = [
  { name: "Caja (POS)", description: "Cobro rápido con lector de códigos de barras o cámara." },
  { name: "Productos", description: "Catálogo, categorías, precios y códigos de barras." },
  { name: "Inventario", description: "Existencias por sucursal, ajustes, traslados y kárdex." },
  { name: "Compras", description: "Proveedores, órdenes de compra y recepción de mercadería." },
  { name: "Reportes", description: "Ventas, márgenes, stock bajo y movimientos." },
  { name: "Administración", description: "Sucursales, usuarios y roles." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold">Tiendix</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Sistema de inventario y punto de venta para tiendas.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <li key={m.name} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="font-semibold">{m.name}</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{m.description}</p>
            <span className="mt-3 inline-block text-xs text-neutral-500">Próximamente</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
