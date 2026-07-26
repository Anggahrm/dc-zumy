import { MessageFlags } from "discord.js";
import { loadGuildFeature } from "#services/guild-config.js";
import { createCard } from "#utils/respond.js";

export const MAX_STICKIES_PER_GUILD = 5;
export const MAX_STICKY_LENGTH = 1000;
const REPOST_DEBOUNCE_MS = 4000;

const STICKIES_DEFAULTS = {};

function normalizeStickies(config) {
  for (const [channelId, entry] of Object.entries(config)) {
    if (!entry || typeof entry !== "object" || typeof entry.content !== "string" || !entry.content.trim()) {
      delete config[channelId];
    }
  }
}

export async function getStickies(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "stickies", STICKIES_DEFAULTS, normalizeStickies, options);
  return Object.fromEntries(Object.entries(config).map(([channelId, entry]) => [channelId, { ...entry }]));
}

export async function setSticky(guildId, channelId, content) {
  const config = await loadGuildFeature(guildId, "stickies", STICKIES_DEFAULTS, normalizeStickies);
  if (!config[channelId] && Object.keys(config).length >= MAX_STICKIES_PER_GUILD) {
    return { ok: false, reason: "full" };
  }

  config[channelId] = {
    content: String(content).trim().slice(0, MAX_STICKY_LENGTH),
    lastMessageId: null,
  };
  return { ok: true };
}

export async function removeSticky(guildId, channelId) {
  const config = await loadGuildFeature(guildId, "stickies", STICKIES_DEFAULTS, normalizeStickies);
  const entry = config[channelId];
  if (!entry) return null;

  const removed = { ...entry };
  delete config[channelId];
  return removed;
}

export async function setStickyMessageId(guildId, channelId, messageId) {
  const config = await loadGuildFeature(guildId, "stickies", STICKIES_DEFAULTS, normalizeStickies);
  const entry = config[channelId];
  if (entry) {
    entry.lastMessageId = messageId;
  }
}

export function buildStickyCard(content) {
  return createCard({
    color: 0xfee75c,
    title: "📌 Sticky",
    body: content,
  });
}

export async function repostSticky({ guild, channelId, logger }) {
  const stickies = await getStickies(guild.id, { preferCache: true }).catch(() => null);
  const entry = stickies?.[channelId];
  if (!entry) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased() || typeof channel.send !== "function") return;

  if (entry.lastMessageId) {
    const old = await channel.messages.fetch(entry.lastMessageId).catch(() => null);
    // Skip reposting when the sticky is already the newest message.
    if (old && channel.lastMessageId === old.id) return;
    await old?.delete().catch(() => {});
  }

  try {
    const message = await channel.send({
      components: [buildStickyCard(entry.content)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    await setStickyMessageId(guild.id, channelId, message.id);
  } catch (error) {
    logger?.warn("Failed to repost sticky message", {
      guildId: guild.id,
      channelId,
      message: error?.message || String(error),
    });
  }
}

const repostTimers = new Map();

// Debounces reposts per channel so busy chats don't churn delete+send on
// every message.
export function scheduleStickyRepost({ guild, channelId, logger }) {
  const key = `${guild.id}:${channelId}`;
  if (repostTimers.has(key)) return;

  const timer = setTimeout(() => {
    repostTimers.delete(key);
    void repostSticky({ guild, channelId, logger });
  }, REPOST_DEBOUNCE_MS);
  timer.unref?.();
  repostTimers.set(key, timer);
}

export function cancelStickyRepost(guildId, channelId) {
  const key = `${guildId}:${channelId}`;
  const timer = repostTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    repostTimers.delete(key);
  }
}
