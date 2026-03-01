const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];
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
    startupDeployMode: normalizeStartupDeployMode(process.env.ZUMY_STARTUP_DEPLOY_MODE),
  };
}
