# Tiendix

Sistema web genérico de **inventario y punto de venta (POS)** para tiendas: stock por sucursal, ventas/cobro, compras a proveedores, reportes y lectura de códigos de barras (lector USB y cámara).

## Stack

- [Next.js 15](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- PostgreSQL 16 + [Prisma](https://www.prisma.io) (ORM y migraciones)
- pnpm como gestor de paquetes
- Docker Compose para la base de datos local
- Próximamente: ZXing (escaneo con cámara), JsBarcode (etiquetas), PWA offline para la caja

## Requisitos (macOS)

| Herramienta | Versión | Instalación sugerida |
| --- | --- | --- |
| Node.js | 22 o superior | `brew install node@22` o [nvm](https://github.com/nvm-sh/nvm) (`nvm use` lee `.nvmrc`) |
| pnpm | 10.16 o superior (probado con 10 y 11) | `corepack enable` o `brew install pnpm` |
| Docker Desktop | reciente | <https://www.docker.com/products/docker-desktop/> |
| Git | cualquiera | viene con las Xcode Command Line Tools (`xcode-select --install`) |
| VS Code (opcional) | — | extensiones recomendadas: *Prisma*, *ESLint*, *Tailwind CSS IntelliSense* |

## Correrlo localmente

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/Oscar10291/Tiendix.git
cd Tiendix
pnpm install

# 2. Variables de entorno
cp .env.example .env

# 3. Levantar PostgreSQL (Docker Desktop debe estar abierto)
pnpm db:up

# 4. Crear las tablas y cargar datos de ejemplo
pnpm db:migrate
pnpm db:seed

# 5. Arrancar la app
pnpm dev
```

Abre <http://localhost:3000>. Para comprobar la conexión a la base de datos: <http://localhost:3000/api/health> debe responder `{"status":"ok","database":"ok"}`.

Usuarios de ejemplo creados por el seed (el seed también crea la *Sucursal Norte*):

| Correo | Contraseña | Rol | Sucursales |
| --- | --- | --- | --- |
| `admin@tiendix.local` | `admin123` | Administrador | todas |
| `gerente@tiendix.local` | `gerente123` | Gerente | Central y Norte |
| `cajero@tiendix.local` | `cajero123` | Cajero | Central |

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` / `pnpm start` | Compilar y correr en modo producción |
| `pnpm lint` / `pnpm typecheck` | ESLint y verificación de tipos |
| `pnpm test` | Pruebas de los cálculos de la caja, compras y reportes (totales, IVA, arqueo, rangos de fechas, archivo de Excel) |
| `pnpm db:up` / `pnpm db:down` | Iniciar / detener PostgreSQL en Docker |
| `pnpm db:migrate` | Crear y aplicar migraciones tras cambiar `prisma/schema.prisma` |
| `pnpm db:seed` | Cargar datos de ejemplo (se puede correr varias veces) |
| `pnpm db:demo` | Cargar 3 semanas de ventas, cortes y compras de demostración para probar los reportes (después de `db:seed`; solo en tu base local) |
| `pnpm db:studio` | Explorador visual de la base de datos (Prisma Studio) |
| `pnpm db:reset` | Borrar la base, reaplicar migraciones y seed |

## Inicio de sesión y permisos

- **Sesiones propias guardadas en la base de datos** (tabla `sessions`), sin librerías externas. La cookie `tiendix_session` (httpOnly) lleva un token aleatorio; en la base solo se guarda su hash. Duran 7 días. Al desactivar un usuario o cambiar su contraseña, sus sesiones se cierran al instante.
- **`src/middleware.ts`**: si no hay cookie, manda al login (o responde 401 en `/api/*`). Las rutas públicas están en `src/lib/auth/constants.ts`.
- **`src/lib/auth/session.ts`**: `requireSession()` y `requirePermission("permiso")` validan la sesión en el servidor. Úsalos al inicio de cada página y de cada *server action* nueva.
- **`src/lib/auth/permissions.ts`**: lista de permisos y qué rol tiene cada uno. Para cambiar lo que puede hacer un rol, se edita solo ahí.
- Cada sesión tiene una **sucursal activa** (selector arriba a la derecha) que usarán la caja y el inventario.
- Protecciones: máximo 5 intentos fallidos de login por correo cada 15 minutos; nadie puede quitarse a sí mismo el rol de administrador ni desactivarse; siempre queda al menos un administrador activo.

| Pantalla | Quién |
| --- | --- |
| `/login` | todos |
| `/` inicio (muestra solo los módulos permitidos) | todos con sesión |
| `/cuenta` datos propios y cambio de contraseña | todos con sesión |
| `/admin/usuarios` crear, editar, activar/desactivar, rol y sucursales | Administrador |
| `/productos` lista y detalle de productos (el cajero no ve el costo) | todos con sesión |
| `/productos/nuevo`, editar, activar/desactivar, `/productos/categorias` | Administrador y Gerente |
| `/inventario` existencias de la sucursal activa y `/inventario/kardex` | Administrador y Gerente |
| `/inventario/movimiento` entradas, salidas y ajustes manuales | Administrador y Gerente |
| `/caja` abrir caja, cobrar y cerrar su propia caja | todos |
| `/ventas` ventas y reimpresión de tickets; `/caja/cortes` cortes de caja | Cajero: solo las suyas · Gerente y Admin: todas las de la sucursal |
| Anular ventas, cerrar la caja de otro usuario | Administrador y Gerente |
| `/compras` órdenes de compra y recepción; `/compras/proveedores` | Administrador y Gerente |
| `/reportes` y el tablero del inicio | Administrador y Gerente (solo de sus sucursales). El cajero ve en el inicio solo lo que lleva vendido hoy |

## Productos e inventario

- **Catálogo** (`/productos`): nombre, SKU (si se deja vacío se genera `P000001`, `P000002`…), categoría, unidad, costo, precio con impuesto, % de impuesto, stock mínimo y varios códigos de barras. Cada código tiene "unidades" para empaques (un fardo de 12 lleva 12). Los productos no se borran: se **desactivan** para no perder su historial.
- **Categorías** (`/productos/categorias`): con subcategorías (p. ej. *Bebidas › Gaseosas*). Desactivar una categoría solo deja de ofrecerla en el formulario.
- **Existencias** (`/inventario`): por sucursal activa, con totales, alertas de **stock bajo** (existencia ≤ mínimo) y **sin stock**, y valor del inventario al costo. El inicio muestra un aviso si hay productos con stock bajo.
- **Movimientos manuales** (`/inventario/movimiento`):
  - *Entrada*: inventario inicial, compra directa, devolución de cliente, bonificación u otro. Una compra directa recalcula el costo promedio del producto (igual que una compra recibida).
  - *Salida*: merma, daño, consumo interno, robo, devolución al proveedor u otro. No deja que la existencia quede negativa.
  - *Ajuste por conteo*: se escribe lo que hay en realidad y el sistema registra la diferencia.
  - El motivo "Otro" exige una nota.
- **Kárdex** (`/inventario/kardex`): historial de cada movimiento con cantidad (+/−), saldo resultante, costo, motivo y usuario; filtros por producto, tipo y fechas.
- Toda la lógica de existencias pasa por `applyStockMovement()` en `src/lib/inventory/stock.ts`, que bloquea la fila del producto mientras actualiza para que dos movimientos al mismo tiempo no se pisen. La caja y las compras también la usan.

### Lector de códigos de barras

No hace falta instalar nada. Los lectores USB o Bluetooth se comportan como un teclado: escriben el código y mandan Enter. Los campos con el ícono de código de barras (en Productos, Inventario y Movimientos) tienen el foco al abrir la página; **F2** o **/** vuelven a enfocarlos.

- En *Movimientos*, escanear selecciona el producto y pasa a la cantidad; si el código es de un empaque, propone esa cantidad (12 para un fardo). Tras guardar, el cursor vuelve al escaneo para seguir con el siguiente producto.
- En el formulario de producto, Enter en un código agrega otra fila en vez de guardar.
- Si se busca un código que no existe, Productos ofrece crear el producto con ese código ya escrito.

## Caja (punto de venta)

Por ahora solo se cobra **en efectivo**. El modelo ya guarda cada pago con su método (`Payment.method`), así que tarjeta, transferencia y pagos mixtos se pueden agregar después sin cambiar las tablas.

1. **Abrir caja** (`/caja`): el cajero escribe el fondo inicial (el sencillo para dar vuelto). Cada usuario puede tener **una sola caja abierta** a la vez, en una sucursal.
2. **Cobrar**: escanear o buscar productos arma el carrito. Escanear de nuevo el mismo producto suma 1 (o 12 si es el código de un fardo). Se puede cambiar la cantidad, poner **descuento por producto** y **descuento a toda la venta**, en quetzales o en %. Los precios ya incluyen IVA; el ticket muestra el IVA incluido.
   - **F12** abre el cobro: se escribe lo recibido (o se toca *Exacto*, *Q50*, *Q100*…) y muestra el **cambio**. Enter confirma.
   - Al confirmar, en una sola transacción se guarda la venta, sus líneas y el pago, y se **descuenta el stock** con un movimiento *Venta* en el kárdex. Si algún producto no alcanza, no se guarda nada (el stock nunca queda negativo). Los servicios (productos sin control de existencias) no descuentan stock.
   - Los precios los toma el servidor de la base de datos; el navegador solo manda cantidades y descuentos.
   - Cada venta lleva un id generado en el navegador: si se hace doble clic o se corta la conexión y se reintenta, no se cobra dos veces.
3. **Ticket**: botón *Imprimir ticket* (o casilla "imprimir automáticamente al cobrar"). Está pensado para impresoras térmicas de **80 mm**; en el diálogo de impresión elige la impresora y márgenes "Ninguno". Se puede reimprimir desde `/ventas`. Dice "Comprobante interno, no es factura".
4. **Cerrar caja / arqueo** (`/caja/cortes/…/cerrar`): se cuentan billetes y monedas de quetzal y el sistema compara con lo esperado (**fondo + efectivo de ventas vigentes**). Guarda el conteo, la diferencia (sobrante o faltante) y una nota. El corte se puede imprimir. Un gerente puede cerrar la caja que un cajero dejó abierta.
5. **Anular venta** (gerente o administrador, en `/ventas/<id>`): pide un motivo, marca la venta como *Anulada* (no se borra) y devuelve el stock con un movimiento *Devolución de cliente · Anulación de venta*. Si la caja de esa venta sigue abierta, el efectivo esperado baja (se supone que el dinero se devolvió desde esa caja); si ya estaba cerrada, el corte guardado no cambia y lo indica.

Los cálculos de dinero se hacen en centavos enteros (`src/lib/pos/money.ts`), igual en el navegador y en el servidor, para evitar errores de redondeo.

## Compras y proveedores

- **Proveedores** (`/compras/proveedores`): nombre, NIT, contacto, teléfono, correo, dirección y notas (crédito, días de visita…). No se permiten dos con el mismo nombre o NIT (se compara sin guiones). No se borran: se **desactivan**, y dejan de ofrecerse en órdenes nuevas.
- **Historial por proveedor** (`/compras/proveedores/<id>`): total comprado (solo lo recibido), lo pendiente de recibir, última recepción, todas sus órdenes con filtro por estado y los productos que más se le compran con el costo promedio pagado.
- **Órdenes de compra** (`/compras/nueva`): proveedor, entrega esperada, nº de factura, nota y productos. Los productos se agregan escaneando o buscando; escanear de nuevo suma la cantidad (o 12 si es el código de un fardo). El costo propuesto es el costo actual del producto y avisa si el nuevo es mayor o menor. El botón **+ Stock bajo** agrega los productos que están en su mínimo o por debajo en la sucursal activa, proponiendo llegar al doble del mínimo.
- **Estados**: *Borrador* → *Enviada* (ya se pidió al proveedor) → *Recibida*, o *Cancelada* (pide motivo; no toca el inventario). Mientras no se recibe, la orden se puede editar. La lista (`/compras`) muestra por defecto las abiertas y marca en rojo las enviadas con la entrega atrasada.
- **Recibir mercadería** (botón en la orden): recibe **toda** la orden en la sucursal de la orden. En una sola transacción:
  1. suma la existencia de cada producto con un movimiento *Compra* en el kárdex (`applyStockMovement`, ligado a la orden con `purchaseId`);
  2. recalcula el **costo promedio ponderado** del producto: `(existencia × costo actual + cantidad comprada × costo de compra) ÷ (existencia + cantidad comprada)`, usando la existencia de todas las sucursales. Si no había existencia, el costo pasa a ser el de la compra;
  3. marca la orden como recibida. Si dos personas la reciben al mismo tiempo, solo una lo logra.
  Si al llegar la mercadería cambió una cantidad o un costo, primero se edita la orden y luego se recibe. Las recepciones parciales no están incluidas por ahora.
- **Repetir pedido** crea una orden nueva con el mismo proveedor y productos. Cada orden se puede **imprimir** para mandarla al proveedor.
- El costo promedio es el que guarda cada venta en `SaleItem.unitCost`, así los reportes de utilidad usan lo que realmente costó la mercadería.
- Los cálculos se hacen en centavos y milésimas enteras (`src/lib/purchases/calc.ts`, con pruebas en `calc.test.ts`).

## Reportes y tablero

- **Tablero del inicio** (gerente y administrador, sucursal activa): vendido hoy comparado con *ayer a esta hora*, número de ventas, ticket promedio, utilidad bruta y margen, gráfica de los últimos 7 días, los 5 más vendidos del día, cajas abiertas con lo que llevan y compras por recibir (y atrasadas).
- **Reportes** (`/reportes`). Todos se filtran por **sucursal** (la activa, otra o *Todas* las que el usuario puede ver) y, los que dependen de fechas, por **desde / hasta** con atajos (hoy, ayer, 7 días, este mes, mes anterior, 30 días, este año). Por defecto: este mes.
  - **Ventas**: por día, semana o mes (los períodos sin ventas también salen) y por cajero; total cobrado, descuentos, IVA incluido, venta sin IVA, costo, utilidad, margen y ticket promedio; comparación con el período anterior del mismo largo; anuladas aparte.
  - **Productos y utilidad**: por producto (ordenable por utilidad, cantidad, venta o margen), por categoría, y **menos vendidos** (incluye los activos que no se vendieron). Las filas con utilidad negativa salen en rojo.
  - **Inventario**: stock bajo con lo que falta para el mínimo, valor del inventario al costo y a precio de venta por categoría y por producto. Es la foto de este momento (no depende de fechas).
  - **Cortes de caja**: cada cierre con fondo, esperado, contado y diferencia; resumen por cajero con faltantes y sobrantes sumados por separado. Avisa qué cajas siguen abiertas.
  - **Compras**: por proveedor y la lista de órdenes **recibidas** en el rango (por fecha de recepción), más lo pendiente de recibir.
- **Cómo se calcula la utilidad**: *venta sin IVA − costo*. El costo es el costo promedio ponderado que la venta guardó en cada línea al cobrar (`SaleItem.unitCost`); si una línea quedó con costo 0 se usa el costo promedio actual del producto. El descuento a toda la venta se reparte entre sus productos, y el IVA de cada venta se reparte entre sus líneas, así el reporte de productos suma lo mismo que el de ventas. Solo cuentan ventas vigentes.
- **Excel**: botón *Descargar Excel* en cada reporte, con los mismos filtros. Trae una hoja *Resumen* y una hoja por tabla, con formato de quetzales, porcentajes y encabezado fijo. Se genera sin librerías externas (`src/lib/reports/xlsx.ts`).
- **PDF**: botón *Imprimir / PDF* abre el diálogo de impresión del navegador; elige *Guardar como PDF*. La hoja sale horizontal, sin el menú ni los filtros, con la fecha en que se generó.
- Las fechas se agrupan en la hora de Guatemala (`TIME_ZONE` en `src/lib/format.ts`); las semanas empiezan en lunes. Rango máximo: 2 años; con más de 92 días se agrupa por semana como mínimo.

## Modelo de datos

Definido en [`prisma/schema.prisma`](prisma/schema.prisma).

| Área | Modelos | Notas |
| --- | --- | --- |
| Organización | `Branch`, `User`, `UserBranch`, `Session`, enum `Role` | Roles: `ADMIN`, `MANAGER`, `CASHIER`. Cada usuario puede tener acceso a varias sucursales. |
| Catálogo | `Category`, `Product`, `ProductBarcode` | Categorías jerárquicas. Un producto puede tener varios códigos de barras (p. ej. unidad y fardo, con `quantity`). Precios con impuesto incluido y `taxRate`. |
| Inventario | `Stock`, `StockMovement` | `Stock` guarda la existencia actual por sucursal; `StockMovement` es el kárdex (entradas positivas, salidas negativas) ligado a la compra/venta que lo originó. Cantidades con 3 decimales para productos a granel. |
| Compras | `Supplier`, `Purchase`, `PurchaseItem` | Estados `DRAFT → ORDERED → RECEIVED` (o `CANCELLED`). Al recibir se generan los movimientos de stock y se recalcula `Product.cost` (costo promedio ponderado). Guarda quién y cuándo envió, recibió o canceló. |
| Ventas | `CashSession`, `Customer`, `Sale`, `SaleItem`, `Payment` | `CashSession` es el turno de caja (fondo, arqueo y diferencia). `Sale.subtotal` = suma de líneas ya con su descuento; `Sale.discount` = descuento a la venta. `Payment` guarda método, monto, efectivo recibido y cambio (listo para pagos mixtos). `SaleItem.unitCost` guarda el costo para reportes de margen. `Sale.clientId` evita cobros duplicados y servirá para ventas sin conexión. |

## Estructura

```
prisma/
  schema.prisma     modelo de datos
  migrations/       migraciones SQL generadas por Prisma
  seed.ts           datos de ejemplo
  demo.ts           ventas, cortes y compras de demostración (pnpm db:demo)
src/
  app/              páginas y rutas API (Next.js App Router)
    (app)/          páginas que exigen sesión (inicio, cuenta, admin, productos, inventario, caja, ventas, compras, reportes)
    ticket/         ticket de venta para imprimir (sin el menú)
    login/          pantalla de inicio de sesión
  components/       componentes compartidos
  lib/auth/         sesiones, permisos por rol y acciones de login
  lib/inventory/    movimientos de stock, motivos y consultas de existencias
  lib/pos/          cálculos de la caja (money.ts) y consultas de turnos (cash.ts)
  lib/purchases/    cálculos de compras y costo promedio (calc.ts, cost.ts), estados de la orden
  lib/reports/      consultas de reportes (load.ts), tablero (dashboard.ts), fechas (range.ts), cálculos (calc.ts) y Excel (xlsx.ts)
  lib/catalog.ts    búsqueda de productos por código, SKU o nombre
  lib/prisma.ts     cliente de Prisma compartido
  middleware.ts     redirige al login si no hay sesión
docker-compose.yml  PostgreSQL local
```

## Próximos pasos

1. ~~Autenticación y permisos por rol~~ ✅
2. ~~Productos, categorías y existencias con entradas/salidas manuales~~ ✅ (falta escaneo con cámara y traslados entre sucursales)
3. ~~Caja (POS): carrito, cobro en efectivo, descuentos, ticket, apertura/cierre y anulaciones~~ ✅ (faltan tarjeta, transferencia y pagos mixtos)
4. ~~Compras, proveedores y recepción de mercadería con costo promedio~~ ✅ (faltan recepciones parciales y devoluciones a proveedor)
5. ~~Reportes y tablero de inicio, con exportación a Excel y PDF~~ ✅
6. PWA offline para la caja
