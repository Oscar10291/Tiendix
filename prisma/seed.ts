// Datos de ejemplo para desarrollo local: `pnpm db:seed`
import { PrismaClient, Role, StockMovementType, UnitOfMeasure } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: "CENTRAL" },
    update: {},
    create: { code: "CENTRAL", name: "Sucursal Central" },
  });

  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@tiendix.local" },
    update: {},
    create: {
      email: "admin@tiendix.local",
      name: "Administrador",
      passwordHash,
      role: Role.ADMIN,
      branches: { create: { branchId: branch.id } },
    },
  });

  // Segunda sucursal y usuarios de prueba para cada rol
  const north = await prisma.branch.upsert({
    where: { code: "NORTE" },
    update: {},
    create: { code: "NORTE", name: "Sucursal Norte" },
  });

  const demoUsers = [
    { email: "gerente@tiendix.local", name: "Gerente de prueba", password: "gerente123", role: Role.MANAGER, branchIds: [branch.id, north.id] },
    { email: "cajero@tiendix.local", name: "Cajero de prueba", password: "cajero123", role: Role.CASHIER, branchIds: [branch.id] },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash: await bcrypt.hash(u.password, 10),
        role: u.role,
        branches: { create: u.branchIds.map((branchId) => ({ branchId })) },
      },
    });
  }

  const categoryNames = ["Bebidas", "Abarrotes", "Limpieza", "Snacks"];
  const categories: Record<string, string> = {};
  for (const name of categoryNames) {
    const existing = await prisma.category.findFirst({ where: { name, parentId: null } });
    const category = existing ?? (await prisma.category.create({ data: { name } }));
    categories[name] = category.id;
  }

  await prisma.supplier.upsert({
    where: { id: "seed-supplier-1" },
    update: {},
    create: { id: "seed-supplier-1", name: "Distribuidora Ejemplo", phone: "5555-0000" },
  });

  const products = [
    { sku: "BEB-001", barcode: "7501055300075", name: "Agua pura 600 ml", category: "Bebidas", cost: 2.5, price: 5, stock: 48 },
    { sku: "BEB-002", barcode: "7501055363057", name: "Refresco cola 355 ml", category: "Bebidas", cost: 4, price: 7, stock: 36 },
    { sku: "ABA-001", barcode: "7501000111206", name: "Arroz 1 lb", category: "Abarrotes", cost: 4.5, price: 6.5, stock: 20 },
    { sku: "ABA-002", barcode: "7501000112203", name: "Frijol negro 1 lb", category: "Abarrotes", cost: 5, price: 8, stock: 20 },
    { sku: "LIM-001", barcode: "7501025403013", name: "Jabón en barra", category: "Limpieza", cost: 3, price: 5.5, stock: 4 },
    { sku: "SNK-001", barcode: "7501011115125", name: "Papas fritas 45 g", category: "Snacks", cost: 3.5, price: 6, stock: 30 },
  ];

  for (const p of products) {
    const exists = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (exists) continue;

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          unit: UnitOfMeasure.UNIT,
          cost: p.cost,
          price: p.price,
          taxRate: 12,
          minStock: 5,
          categoryId: categories[p.category],
          barcodes: { create: { code: p.barcode } },
        },
      });
      await tx.stockMovement.create({
        data: {
          type: StockMovementType.INITIAL,
          branchId: branch.id,
          productId: product.id,
          quantity: p.stock,
          balance: p.stock,
          unitCost: p.cost,
          userId: admin.id,
          note: "Carga inicial (seed)",
        },
      });
      await tx.stock.create({
        data: { branchId: branch.id, productId: product.id, quantity: p.stock },
      });
    });
  }

  console.log("Seed listo. Usuarios de prueba:");
  console.log("  admin@tiendix.local   / admin123   (Administrador)");
  console.log("  gerente@tiendix.local / gerente123 (Gerente)");
  console.log("  cajero@tiendix.local  / cajero123  (Cajero)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
