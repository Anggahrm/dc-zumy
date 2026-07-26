import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { withSslMode } from "./src/db/ssl.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run Drizzle commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dbCredentials: {
    // drizzle-kit ignores the `ssl` field when `url` is present, so the SSL
    // mode must live inside the connection string.
    url: withSslMode(process.env.DATABASE_URL),
  },
});
