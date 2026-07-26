import { loadGuildFeature } from "#services/guild-config.js";

export const MAX_AUTOMESSAGES = 10;
export const MAX_AUTOMESSAGE_LENGTH = 1000;
export const MIN_INTERVAL_MS = 30 * 60 * 1000;
export const MAX_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTOMESSAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]{0,31}$/;

const AUTOMESSAGES_DEFAULTS = {};

function normalizeAutomessages(config) {
  for (const [name, entry] of Object.entries(config)) {
    if (
      !AUTOMESSAGE_NAME_PATTERN.test(name)
      || !entry
      || typeof entry !== "object"
      || typeof entry.channelId !== "string"
      || typeof entry.content !== "string"
      || !entry.content.trim()
      || !Number.isInteger(entry.intervalMs)
      || entry.intervalMs < MIN_INTERVAL_MS
      || entry.intervalMs > MAX_INTERVAL_MS
    ) {
      delete config[name];
    }
  }
}

export function sanitizeAutomessageName(name) {
  const value = String(name ?? "").trim().toLowerCase();
  return AUTOMESSAGE_NAME_PATTERN.test(value) ? value : null;
}

export function automessageJobKey(guildId, name) {
  return `automessage:${guildId}:${name}`;
}

export async function getAutomessages(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "automessages", AUTOMESSAGES_DEFAULTS, normalizeAutomessages, options);
  return Object.fromEntries(Object.entries(config).map(([name, entry]) => [name, { ...entry }]));
}

export async function createAutomessage(guildId, name, { channelId, content, intervalMs }) {
  const safeName = sanitizeAutomessageName(name);
  if (!safeName) return { ok: false, reason: "invalid_name" };

  const config = await loadGuildFeature(guildId, "automessages", AUTOMESSAGES_DEFAULTS, normalizeAutomessages);
  if (config[safeName]) return { ok: false, reason: "exists" };
  if (Object.keys(config).length >= MAX_AUTOMESSAGES) return { ok: false, reason: "full" };

  config[safeName] = {
    channelId,
    content: String(content).trim().slice(0, MAX_AUTOMESSAGE_LENGTH),
    intervalMs,
  };
  return { ok: true, name: safeName };
}

export async function deleteAutomessage(guildId, name) {
  const safeName = sanitizeAutomessageName(name);
  if (!safeName) return false;

  const config = await loadGuildFeature(guildId, "automessages", AUTOMESSAGES_DEFAULTS, normalizeAutomessages);
  if (!config[safeName]) return false;
  delete config[safeName];
  return true;
}

export function renderAutomessage(content, { guildName }) {
  return content.replaceAll("{server}", guildName);
}
