import "server-only";

import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return drizzle(databaseUrl, { schema });
}

type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

function getDatabase(): Database {
  database ??= createDatabase();
  return database;
}

/**
 * Lazily initializes the Neon client on first database use.
 *
 * Next.js imports route modules while collecting build metadata. Deferring the
 * environment check keeps builds independent from runtime secrets, while a
 * request that actually needs the database still fails with the same explicit
 * configuration error.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const activeDatabase = getDatabase();
    const value = Reflect.get(activeDatabase, property, activeDatabase);

    return typeof value === "function" ? value.bind(activeDatabase) : value;
  },
});
