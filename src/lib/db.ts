import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  pgPool: pg.Pool;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

function createPool() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL! });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

/** Direct pg Pool for raw SQL operations (pgvector queries). */
export function getPool(): pg.Pool {
  if (!globalForPrisma.pgPool) {
    globalForPrisma.pgPool = createPool();
  }
  return globalForPrisma.pgPool;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
