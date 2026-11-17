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
| `pnpm db:up` / `pnpm db:down` | Iniciar / detener PostgreSQL en Docker |
| `pnpm db:migrate` | Crear y aplicar migraciones tras cambiar `prisma/schema.prisma` |
| `pnpm db:seed` | Cargar datos de ejemplo (se puede correr varias veces) |
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

## Productos e inventario

- **Catálogo** (`/productos`): nombre, SKU (si se deja vacío se genera `P000001`, `P000002`…), categoría, unidad, costo, precio con impuesto, % de impuesto, stock mínimo y varios códigos de barras. Cada código tiene "unidades" para empaques (un fardo de 12 lleva 12). Los productos no se borran: se **desactivan** para no perder su historial.
- **Categorías** (`/productos/categorias`): con subcategorías (p. ej. *Bebidas › Gaseosas*). Desactivar una categoría solo deja de ofrecerla en el formulario.
- **Existencias** (`/inventario`): por sucursal activa, con totales, alertas de **stock bajo** (existencia ≤ mínimo) y **sin stock**, y valor del inventario al costo. El inicio muestra un aviso si hay productos con stock bajo.
- **Movimientos manuales** (`/inventario/movimiento`):
  - *Entrada*: inventario inicial, compra directa, devolución de cliente, bonificación u otro. Una compra directa con costo nuevo actualiza el costo del producto.
  - *Salida*: merma, daño, consumo interno, robo, devolución al proveedor u otro. No deja que la existencia quede negativa.
  - *Ajuste por conteo*: se escribe lo que hay en realidad y el sistema registra la diferencia.
  - El motivo "Otro" exige una nota.
- **Kárdex** (`/inventario/kardex`): historial de cada movimiento con cantidad (+/−), saldo resultante, costo, motivo y usuario; filtros por producto, tipo y fechas.
- Toda la lógica de existencias pasa por `applyStockMovement()` en `src/lib/inventory/stock.ts`, que bloquea la fila del producto mientras actualiza para que dos movimientos al mismo tiempo no se pisen. La caja y las compras la usarán también.

### Lector de códigos de barras

No hace falta instalar nada. Los lectores USB o Bluetooth se comportan como un teclado: escriben el código y mandan Enter. Los campos con el ícono de código de barras (en Productos, Inventario y Movimientos) tienen el foco al abrir la página; **F2** o **/** vuelven a enfocarlos.

- En *Movimientos*, escanear selecciona el producto y pasa a la cantidad; si el código es de un empaque, propone esa cantidad (12 para un fardo). Tras guardar, el cursor vuelve al escaneo para seguir con el siguiente producto.
- En el formulario de producto, Enter en un código agrega otra fila en vez de guardar.
- Si se busca un código que no existe, Productos ofrece crear el producto con ese código ya escrito.

## Modelo de datos

Definido en [`prisma/schema.prisma`](prisma/schema.prisma).

| Área | Modelos | Notas |
| --- | --- | --- |
| Organización | `Branch`, `User`, `UserBranch`, `Session`, enum `Role` | Roles: `ADMIN`, `MANAGER`, `CASHIER`. Cada usuario puede tener acceso a varias sucursales. |
| Catálogo | `Category`, `Product`, `ProductBarcode` | Categorías jerárquicas. Un producto puede tener varios códigos de barras (p. ej. unidad y fardo, con `quantity`). Precios con impuesto incluido y `taxRate`. |
| Inventario | `Stock`, `StockMovement` | `Stock` guarda la existencia actual por sucursal; `StockMovement` es el kárdex (entradas positivas, salidas negativas) ligado a la compra/venta que lo originó. Cantidades con 3 decimales para productos a granel. |
| Compras | `Supplier`, `Purchase`, `PurchaseItem` | Estados `DRAFT → ORDERED → RECEIVED`. Al recibir se generarán los movimientos de stock. |
| Ventas | `Customer`, `Sale`, `SaleItem`, `Payment` | Pagos mixtos (efectivo, tarjeta, transferencia). `SaleItem.unitCost` guarda el costo para reportes de margen. `Sale.clientId` permitirá sincronizar ventas hechas sin conexión. |

## Estructura

```
prisma/
  schema.prisma     modelo de datos
  migrations/       migraciones SQL generadas por Prisma
  seed.ts           datos de ejemplo
src/
  app/              páginas y rutas API (Next.js App Router)
    (app)/          páginas que exigen sesión (inicio, cuenta, admin, productos, inventario)
    login/          pantalla de inicio de sesión
  components/       componentes compartidos
  lib/auth/         sesiones, permisos por rol y acciones de login
  lib/inventory/    movimientos de stock, motivos y consultas de existencias
  lib/catalog.ts    búsqueda de productos por código, SKU o nombre
  lib/prisma.ts     cliente de Prisma compartido
  middleware.ts     redirige al login si no hay sesión
docker-compose.yml  PostgreSQL local
```

## Próximos pasos

1. ~~Autenticación y permisos por rol~~ ✅
2. ~~Productos, categorías y existencias con entradas/salidas manuales~~ ✅ (falta escaneo con cámara y traslados entre sucursales)
3. Caja (POS): búsqueda por código, carrito, cobro y ticket
4. Compras y recepción de mercadería
5. Reportes (ventas por día, stock bajo, kárdex)
6. PWA offline para la caja
