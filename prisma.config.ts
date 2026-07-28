import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

// Prisma CLI kjorer migreringer og seed mot den direkte tilkoblingen (port 5432),
// mens applikasjonen bruker transaction pooler (port 6543) gjennom DATABASE_URL.
// Tom streng er tillatt slik at `prisma generate` fungerer for .env.local er fylt ut.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --env-file-if-exists=.env --env-file-if-exists=.env.local prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
