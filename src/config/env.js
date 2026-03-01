const levels = new Set(["debug", "info", "warn", "error"]);
const startupDeployModes = new Set(["off", "global", "guild"]);

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

function normalizeStartupDeployMode(value) {
  const normalized = String(value ?? "global").toLowerCase();
  return startupDeployModes.has(normalized) ? normalized : "global";
}

function getCommonEnv() {
  return {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    owners: parseOwners(process.env.BOT_OWNERS),
    logLevel: normalizeLogLevel(process.env.LOG_LEVEL),
    startupDeployMode: normalizeStartupDeployMode(process.env.ZUMY_STARTUP_DEPLOY_MODE),
  };
}

function requireKeys(requiredKeys) {
  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function getDiscordEnv() {
  requireKeys(["DISCORD_TOKEN", "DISCORD_CLIENT_ID"]);
  return getCommonEnv();
}

export function getRuntimeEnv() {
  requireKeys(["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DATABASE_URL"]);
  return {
    ...getCommonEnv(),
    databaseUrl: process.env.DATABASE_URL,
  };
}
