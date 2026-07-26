import { loadGuildFeature } from "#services/guild-config.js";

export const MAX_TAGS = 50;
export const MAX_TAG_CONTENT_LENGTH = 1500;
export const TAG_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]{0,31}$/;

const TAGS_DEFAULTS = {};

function normalizeTags(config) {
  for (const [name, entry] of Object.entries(config)) {
    if (
      !TAG_NAME_PATTERN.test(name)
      || !entry
      || typeof entry !== "object"
      || typeof entry.content !== "string"
      || !entry.content.trim()
    ) {
      delete config[name];
    }
  }
}

export function sanitizeTagName(name) {
  const value = String(name ?? "").trim().toLowerCase();
  return TAG_NAME_PATTERN.test(value) ? value : null;
}

export async function getTags(guildId) {
  const config = await loadGuildFeature(guildId, "tags", TAGS_DEFAULTS, normalizeTags);
  return Object.fromEntries(Object.entries(config).map(([name, entry]) => [name, { ...entry }]));
}

export async function getTag(guildId, name) {
  const safeName = sanitizeTagName(name);
  if (!safeName) return null;
  const config = await loadGuildFeature(guildId, "tags", TAGS_DEFAULTS, normalizeTags);
  const entry = config[safeName];
  return entry ? { name: safeName, ...entry } : null;
}

export async function createTag(guildId, name, content, createdBy) {
  const safeName = sanitizeTagName(name);
  if (!safeName) {
    return { ok: false, reason: "invalid_name" };
  }

  const text = String(content ?? "").trim().slice(0, MAX_TAG_CONTENT_LENGTH);
  if (!text) {
    return { ok: false, reason: "empty_content" };
  }

  const config = await loadGuildFeature(guildId, "tags", TAGS_DEFAULTS, normalizeTags);
  if (config[safeName]) {
    return { ok: false, reason: "exists" };
  }
  if (Object.keys(config).length >= MAX_TAGS) {
    return { ok: false, reason: "full" };
  }

  config[safeName] = {
    content: text,
    createdBy,
    at: Date.now(),
  };

  return { ok: true, name: safeName };
}

export async function deleteTag(guildId, name) {
  const safeName = sanitizeTagName(name);
  if (!safeName) return false;

  const config = await loadGuildFeature(guildId, "tags", TAGS_DEFAULTS, normalizeTags);
  if (!config[safeName]) return false;

  delete config[safeName];
  return true;
}
