const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DATABASE_URL"];
const levels = new Set(["debug", "info", "warn", "error"]);

function parseOwners(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function normalizeLogLevel(value) {
  const normalized = String(value ?? "info").toLowerCase();
  return levels.has(normalized) ? normalized : "info";
}

export function getEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    owners: parseOwners(process.env.BOT_OWNERS),
    logLevel: normalizeLogLevel(process.env.LOG_LEVEL),
    databaseUrl: process.env.DATABASE_URL,
  };
}
