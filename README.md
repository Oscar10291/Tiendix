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
| pnpm | 10 | `corepack enable` o `brew install pnpm` |
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

Usuario de ejemplo creado por el seed: `admin@tiendix.local` / `admin123` (el login aún no está implementado).

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

## Modelo de datos

Definido en [`prisma/schema.prisma`](prisma/schema.prisma).

| Área | Modelos | Notas |
| --- | --- | --- |
| Organización | `Branch`, `User`, `UserBranch`, enum `Role` | Roles: `ADMIN`, `MANAGER`, `CASHIER`. Cada usuario puede tener acceso a varias sucursales. |
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
  lib/prisma.ts     cliente de Prisma compartido
docker-compose.yml  PostgreSQL local
```

## Próximos pasos

1. Autenticación y permisos por rol
2. CRUD de productos y categorías, con escaneo de códigos de barras
3. Caja (POS): búsqueda por código, carrito, cobro y ticket
4. Compras y recepción de mercadería
5. Reportes (ventas por día, stock bajo, kárdex)
6. PWA offline para la caja
