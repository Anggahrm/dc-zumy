import { loadGuildFeature } from "#services/guild-config.js";

export const MAX_AFK_REASON_LENGTH = 200;
const MAX_AFK_ENTRIES = 500;

const AFK_DEFAULTS = {};

function normalizeAfk(config) {
  for (const [userId, entry] of Object.entries(config)) {
    if (!entry || typeof entry !== "object" || typeof entry.since !== "number") {
      delete config[userId];
    }
  }
}

export async function setAfk(guildId, userId, reason) {
  const config = await loadGuildFeature(guildId, "afk", AFK_DEFAULTS, normalizeAfk);

  const ids = Object.keys(config);
  if (ids.length >= MAX_AFK_ENTRIES && !config[userId]) {
    const oldest = ids.sort((a, b) => (config[a].since ?? 0) - (config[b].since ?? 0))[0];
    delete config[oldest];
  }

  config[userId] = {
    reason: String(reason ?? "").trim().slice(0, MAX_AFK_REASON_LENGTH) || "AFK",
    since: Date.now(),
  };
  return config[userId];
}

export async function clearAfk(guildId, userId) {
  const config = await loadGuildFeature(guildId, "afk", AFK_DEFAULTS, normalizeAfk);
  const entry = config[userId];
  if (!entry) return null;

  const removed = { ...entry };
  delete config[userId];
  return removed;
}

export async function getAfk(guildId, userId, options = {}) {
  const config = await loadGuildFeature(guildId, "afk", AFK_DEFAULTS, normalizeAfk, options);
  const entry = config[userId];
  return entry ? { ...entry } : null;
}

export async function getAfkMap(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "afk", AFK_DEFAULTS, normalizeAfk, options);
  return Object.fromEntries(Object.entries(config).map(([userId, entry]) => [userId, { ...entry }]));
}

const noticeCooldowns = new Map();
const NOTICE_COOLDOWN_MS = 30_000;
const NOTICE_COOLDOWN_MAX = 2000;

// Limits "X is AFK" notices to one per mentioned user per channel per 30s.
export function shouldNotifyAfk(channelId, userId, now = Date.now()) {
  const key = `${channelId}:${userId}`;
  const readyAt = noticeCooldowns.get(key) ?? 0;
  if (readyAt > now) return false;

  if (noticeCooldowns.size > NOTICE_COOLDOWN_MAX) {
    const oldest = noticeCooldowns.keys().next().value;
    noticeCooldowns.delete(oldest);
  }
  noticeCooldowns.set(key, now + NOTICE_COOLDOWN_MS);
  return true;
}
