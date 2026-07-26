import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { resolveSsl } from "./src/db/ssl.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run Drizzle commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: resolveSsl(process.env.DATABASE_URL),
  },
});
