import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // Supabase Supavisor i transaction mode tar seg av pooling, sa adapteret
  // holder bare en liten pool per instans.
  const adapter = new PrismaPg({ connectionString: env.databaseUrl, max: 5 });
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prismaClient) {
    globalForPrisma.prismaClient = createPrismaClient();
  }
  return globalForPrisma.prismaClient;
}

/**
 * Klienten opprettes forst ved forste bruk. Det gjor at moduler kan importere
 * `prisma` uten at manglende DATABASE_URL bryter bygget.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
