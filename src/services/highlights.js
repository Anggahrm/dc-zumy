import { loadGuildFeature } from "#services/guild-config.js";

export const MAX_HIGHLIGHT_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 50;
const MAX_HIGHLIGHT_USERS = 500;
const DM_COOLDOWN_MS = 5 * 60 * 1000;

const HIGHLIGHTS_DEFAULTS = {};

function normalizeHighlights(config) {
  for (const [userId, keywords] of Object.entries(config)) {
    if (!Array.isArray(keywords) || keywords.length === 0) {
      delete config[userId];
      continue;
    }
    const cleaned = [...new Set(
      keywords
        .filter((word) => typeof word === "string")
        .map((word) => word.trim().toLowerCase().slice(0, MAX_KEYWORD_LENGTH))
        .filter(Boolean),
    )].slice(0, MAX_HIGHLIGHT_KEYWORDS);
    if (cleaned.length !== keywords.length || cleaned.some((word, i) => word !== keywords[i])) {
      config[userId] = cleaned;
    }
  }
}

export async function getHighlights(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "highlights", HIGHLIGHTS_DEFAULTS, normalizeHighlights, options);
  return Object.fromEntries(Object.entries(config).map(([userId, keywords]) => [userId, [...keywords]]));
}

export async function addHighlight(guildId, userId, keyword) {
  const word = String(keyword ?? "").trim().toLowerCase().slice(0, MAX_KEYWORD_LENGTH);
  if (!word || word.length < 2) return { ok: false, reason: "invalid" };

  const config = await loadGuildFeature(guildId, "highlights", HIGHLIGHTS_DEFAULTS, normalizeHighlights);
  const mine = config[userId] ?? [];
  if (mine.includes(word)) return { ok: false, reason: "exists" };
  if (mine.length >= MAX_HIGHLIGHT_KEYWORDS) return { ok: false, reason: "full" };
  if (!config[userId] && Object.keys(config).length >= MAX_HIGHLIGHT_USERS) return { ok: false, reason: "guild_full" };

  config[userId] = [...mine, word];
  return { ok: true, word };
}

export async function removeHighlight(guildId, userId, keyword) {
  const word = String(keyword ?? "").trim().toLowerCase();
  const config = await loadGuildFeature(guildId, "highlights", HIGHLIGHTS_DEFAULTS, normalizeHighlights);
  const mine = config[userId] ?? [];
  const next = mine.filter((entry) => entry !== word);
  if (next.length === mine.length) return false;

  if (next.length === 0) {
    delete config[userId];
  } else {
    config[userId] = next;
  }
  return true;
}

export async function clearHighlights(guildId, userId) {
  const config = await loadGuildFeature(guildId, "highlights", HIGHLIGHTS_DEFAULTS, normalizeHighlights);
  if (!config[userId]) return false;
  delete config[userId];
  return true;
}

// --- matching (compiled per guild, cache invalidated by content key) ---

const regexCache = new Map();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compiledFor(guildId, highlights) {
  const key = JSON.stringify(highlights);
  const cached = regexCache.get(guildId);
  if (cached && cached.key === key) return cached.compiled;

  const compiled = Object.entries(highlights).map(([userId, keywords]) => ({
    userId,
    regex: new RegExp(
      `(?<=^|[^\\p{L}\\p{N}])(?:${keywords.map(escapeRegex).join("|")})(?=$|[^\\p{L}\\p{N}])`,
      "iu",
    ),
  }));
  regexCache.set(guildId, { key, compiled });
  return compiled;
}

const dmCooldowns = new Map();

function onDmCooldown(guildId, userId, now = Date.now()) {
  const key = `${guildId}:${userId}`;
  const readyAt = dmCooldowns.get(key) ?? 0;
  if (readyAt > now) return true;

  if (dmCooldowns.size > 5000) {
    const oldest = dmCooldowns.keys().next().value;
    dmCooldowns.delete(oldest);
  }
  dmCooldowns.set(key, now + DM_COOLDOWN_MS);
  return false;
}

// Returns user ids whose keywords match this content, excluding the author,
// already-mentioned users, and users on DM cooldown.
export function matchHighlights({ guildId, highlights, content, authorId, mentionedIds }) {
  if (!content) return [];
  const compiled = compiledFor(guildId, highlights);
  const hits = [];

  for (const entry of compiled) {
    if (entry.userId === authorId) continue;
    if (mentionedIds?.has(entry.userId)) continue;
    if (!entry.regex.test(content)) continue;
    if (onDmCooldown(guildId, entry.userId)) continue;
    hits.push(entry.userId);
    if (hits.length >= 5) break;
  }

  return hits;
}
