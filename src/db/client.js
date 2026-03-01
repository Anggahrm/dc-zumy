import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "#db/schema.js";

let pool = null;
let db = null;

function ensureDbClient() {
  if (db) {
    return db;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured. Set it in .env before using database features.");
  }

  pool = new Pool({ connectionString });
  db = drizzle({ client: pool, schema });
  return db;
}

export function getDb() {
  return ensureDbClient();
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
