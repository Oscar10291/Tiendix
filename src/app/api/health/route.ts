import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/health → verifica que la app y la base de datos respondan
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
