import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export type PipHackLupDb = NeonHttpDatabase<typeof schema>;

let db: PipHackLupDb | null = null;

export function getDb(): PipHackLupDb {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required to initialize the PipHackLup database client.");
    }
    db = drizzle(neon(databaseUrl), { schema });
  }

  return db;
}
