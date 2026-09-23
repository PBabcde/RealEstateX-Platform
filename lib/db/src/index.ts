import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : undefined;
export const db = pool ? drizzle(pool, { schema }) : undefined;

export function requireDb() {
  if (!db || !pool) {
    throw new Error(
      "DATABASE_URL must be set to use PostgreSQL-backed RealEstateX storage.",
    );
  }
  return { db, pool };
}

export * from "./schema";
export * from "./audit";
export { sql } from "drizzle-orm";
