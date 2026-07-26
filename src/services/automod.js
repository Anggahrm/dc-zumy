import { loadGuildFeature } from "#services/guild-config.js";

export const MAX_BANNED_WORDS = 50;
export const MAX_WORD_LENGTH = 60;
export const MAX_MENTION_LIMIT = 50;

const AUTOMOD_DEFAULTS = {
  antiInvite: false,
  bannedWords: [],
  mentionLimit: 0,
};

const INVITE_PATTERN = /(?:discord\.(?:gg|io|me)|discord(?:app)?\.com\/invite)\/[\w-]+/i;

function normalizeAutomod(config) {
  if (typeof config.antiInvite !== "boolean") config.antiInvite = false;

  const words = Array.isArray(config.bannedWords) ? config.bannedWords : [];
  const cleaned = [];
  const seen = new Set();
  for (const word of words) {
    if (typeof word !== "string") continue;
    const value = word.trim().toLowerCase().slice(0, MAX_WORD_LENGTH);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value);
  }
  if (cleaned.length !== words.length || cleaned.some((word, i) => word !== words[i])) {
    config.bannedWords = cleaned;
  }

  if (!Number.isInteger(config.mentionLimit) || config.mentionLimit < 0 || config.mentionLimit > MAX_MENTION_LIMIT) {
    config.mentionLimit = 0;
  }
}

function cloneConfig(config) {
  return {
    antiInvite: config.antiInvite,
    bannedWords: [...config.bannedWords],
    mentionLimit: config.mentionLimit,
  };
}

export async function getAutomodConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "automod", AUTOMOD_DEFAULTS, normalizeAutomod, options);
  return cloneConfig(config);
}

export async function setAntiInvite(guildId, enabled) {
  const config = await loadGuildFeature(guildId, "automod", AUTOMOD_DEFAULTS, normalizeAutomod);
  config.antiInvite = Boolean(enabled);
  return cloneConfig(config);
}

export async function addBannedWord(guildId, word) {
  const config = await loadGuildFeature(guildId, "automod", AUTOMOD_DEFAULTS, normalizeAutomod);
  const value = String(word ?? "").trim().toLowerCase().slice(0, MAX_WORD_LENGTH);
  if (!value) {
    return { added: false, reason: "empty", config: cloneConfig(config) };
  }
  if (config.bannedWords.includes(value)) {
    return { added: false, reason: "exists", config: cloneConfig(config) };
  }
  if (config.bannedWords.length >= MAX_BANNED_WORDS) {
    return { added: false, reason: "full", config: cloneConfig(config) };
  }

  config.bannedWords = [...config.bannedWords, value];
  return { added: true, word: value, config: cloneConfig(config) };
}

export async function removeBannedWord(guildId, word) {
  const config = await loadGuildFeature(guildId, "automod", AUTOMOD_DEFAULTS, normalizeAutomod);
  const value = String(word ?? "").trim().toLowerCase();
  const next = config.bannedWords.filter((entry) => entry !== value);
  const removed = next.length !== config.bannedWords.length;
  if (removed) {
    config.bannedWords = next;
  }
  return { removed, config: cloneConfig(config) };
}

export async function setMentionLimit(guildId, limit) {
  const config = await loadGuildFeature(guildId, "automod", AUTOMOD_DEFAULTS, normalizeAutomod);
  config.mentionLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_MENTION_LIMIT) : 0;
  return cloneConfig(config);
}

export function isAutomodActive(config) {
  return config.antiInvite || config.bannedWords.length > 0 || config.mentionLimit > 0;
}

// Returns a violation descriptor, or null when the message is clean.
export function checkMessage(config, message) {
  const content = message.content ?? "";

  if (config.antiInvite && INVITE_PATTERN.test(content)) {
    return { rule: "anti_invite", label: "Discord invite link" };
  }

  if (config.bannedWords.length > 0 && content) {
    const lowered = content.toLowerCase();
    const hit = config.bannedWords.find((word) => lowered.includes(word));
    if (hit) {
      return { rule: "banned_word", label: `Banned word (\`${hit.replaceAll("`", "'")}\`)` };
    }
  }

  if (config.mentionLimit > 0) {
    const mentionCount = (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0);
    if (mentionCount >= config.mentionLimit) {
      return { rule: "mention_spam", label: `Mention spam (${mentionCount} mentions)` };
    }
  }

  return null;
}
