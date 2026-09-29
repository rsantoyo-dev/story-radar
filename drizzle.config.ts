import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// CLI commands have no NODE_ENV by default. Treat them as development so a
// placeholder .env.production.local cannot shadow the real local database.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const databaseUrl = process.env.DATABASE_URL_DIRECT;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_DIRECT is not configured");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
