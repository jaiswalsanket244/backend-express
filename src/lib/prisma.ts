import { PrismaClient } from "@prisma/client";

/**
 * Single shared PrismaClient instance for the app.
 * (In dev with hot-reload, reuse the instance across reloads to avoid
 * exhausting the connection pool.)
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
