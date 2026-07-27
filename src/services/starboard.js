import { and, eq } from "drizzle-orm";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { getDb } from "#db/client.js";
import { starboardEntries } from "#db/schema.js";
import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";
import { createCard } from "#utils/respond.js";

const STARBOARD_DEFAULTS = {
  channelId: null,
  emoji: "⭐",
  threshold: 3,
  selfStar: false,
  ignoredChannels: [],
};

function normalizeStarboard(config) {
  config.channelId = guildFeatureUtils.sanitizeChannelId(config.channelId);
  if (typeof config.emoji !== "string" || !config.emoji.trim()) config.emoji = "⭐";
  if (!Number.isInteger(config.threshold) || config.threshold < 1 || config.threshold > 100) config.threshold = 3;
  if (typeof config.selfStar !== "boolean") config.selfStar = false;
  const ignored = Array.isArray(config.ignoredChannels)
    ? [...new Set(config.ignoredChannels.filter((id) => typeof id === "string" && id.trim()))]
    : [];
  if (!Array.isArray(config.ignoredChannels) || ignored.length !== config.ignoredChannels.length) {
    config.ignoredChannels = ignored;
  }
}

function cloneConfig(config) {
  return {
    channelId: config.channelId,
    emoji: config.emoji,
    threshold: config.threshold,
    selfStar: config.selfStar,
    ignoredChannels: [...config.ignoredChannels],
  };
}

export async function getStarboardConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "starboard", STARBOARD_DEFAULTS, normalizeStarboard, options);
  return cloneConfig(config);
}

export async function updateStarboardConfig(guildId, mutate) {
  const config = await loadGuildFeature(guildId, "starboard", STARBOARD_DEFAULTS, normalizeStarboard);
  const result = mutate(config);
  normalizeStarboard(config);
  return { result, config: cloneConfig(config) };
}

// Parses admin input into the stored emoji key: custom emoji -> its id,
// anything else -> the trimmed literal.
export function parseEmojiInput(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  const custom = text.match(/^<a?:\w+:(\d+)>$/);
  return custom ? custom[1] : text.slice(0, 64);
}

export function reactionMatches(config, emoji) {
  return emoji.id ? emoji.id === config.emoji : emoji.name === config.emoji;
}

export function formatEmoji(config, guild) {
  if (/^\d{5,30}$/.test(config.emoji)) {
    const custom = guild?.emojis.cache.get(config.emoji);
    return custom ? custom.toString() : `(custom emoji ${config.emoji})`;
  }
  return config.emoji;
}

// Counts qualifying reactions on a message: total users minus the author's
// own star when self-star is disallowed and minus bots. Paginates past
// Discord's 100-user page size.
export async function countStars(reaction, message, config) {
  let count = 0;
  let after;

  for (let page = 0; page < 20; page += 1) {
    const users = await reaction.users.fetch({ limit: 100, after });
    for (const user of users.values()) {
      if (user.bot) continue;
      if (!config.selfStar && user.id === message.author?.id) continue;
      count += 1;
    }
    if (users.size < 100) break;
    after = users.lastKey();
  }

  return count;
}

function messageLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export function buildStarboardCard({ message, count, config, guild }) {
  const content = message.content?.trim()
    ? message.content.trim().slice(0, 900)
    : "(no text)";
  const image = message.attachments?.find((attachment) => attachment.contentType?.startsWith("image/"));

  const lines = [
    `**${formatEmoji(config, guild)} ${count}** in <#${message.channelId}>`,
    "",
    content,
    ...(message.attachments?.size > 0 && !image ? [`-# ${message.attachments.size} attachment(s)`] : []),
    "",
    `[Jump to message](${messageLink(guild.id, message.channelId, message.id)})`,
  ];

  return createCard({
    color: 0xf1c40f,
    title: null,
    body: lines.join("\n"),
    actorName: message.author?.tag ?? "Unknown user",
    actorAvatarUrl: message.author?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
    thumbnailUrl: image?.url ?? null,
    thumbnailDescription: image ? "starred image" : null,
  });
}

export async function getEntry(guildId, messageId) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(starboardEntries)
    .where(and(eq(starboardEntries.guildId, guildId), eq(starboardEntries.messageId, messageId)))
    .limit(1);
  return row ?? null;
}

export async function saveEntry({ guildId, messageId, channelId, authorId, starboardMessageId, starCount }) {
  const db = getDb();
  await db
    .insert(starboardEntries)
    .values({ guildId, messageId, channelId, authorId, starboardMessageId, starCount })
    .onConflictDoUpdate({
      target: [starboardEntries.guildId, starboardEntries.messageId],
      set: { starboardMessageId, starCount },
    });
}

export async function deleteEntry(guildId, messageId) {
  const db = getDb();
  const rows = await db
    .delete(starboardEntries)
    .where(and(eq(starboardEntries.guildId, guildId), eq(starboardEntries.messageId, messageId)))
    .returning();
  return rows[0] ?? null;
}

async function resolveStarboardChannel(guild, config) {
  if (!config.channelId) return null;
  const channel = guild.channels.cache.get(config.channelId)
    ?? (await guild.channels.fetch(config.channelId).catch(() => null));
  if (!channel || !channel.isTextBased() || typeof channel.send !== "function") return null;
  return channel;
}

// Creates, updates, or removes the starboard post to reflect `count`.
export async function syncStarboardPost({ guild, message, count, config, logger }) {
  const channel = await resolveStarboardChannel(guild, config);
  if (!channel) return;

  const entry = await getEntry(guild.id, message.id);

  if (count < config.threshold) {
    if (entry) {
      const posted = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
      await posted?.delete().catch(() => {});
      await deleteEntry(guild.id, message.id);
    }
    return;
  }

  const card = buildStarboardCard({ message, count, config, guild });

  if (entry) {
    const posted = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
    if (posted) {
      await posted.edit({ components: [card], allowedMentions: { parse: [] } }).catch(() => {});
      await saveEntry({
        guildId: guild.id,
        messageId: message.id,
        channelId: message.channelId,
        authorId: message.author?.id ?? null,
        starboardMessageId: entry.starboardMessageId,
        starCount: count,
      });
      return;
    }
  }

  try {
    const posted = await channel.send({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    await saveEntry({
      guildId: guild.id,
      messageId: message.id,
      channelId: message.channelId,
      authorId: message.author?.id ?? null,
      starboardMessageId: posted.id,
      starCount: count,
    });
  } catch (error) {
    logger?.warn("Failed to post starboard entry", {
      guildId: guild.id,
      messageId: message.id,
      message: error?.message || String(error),
    });
  }
}

// Removes a source message's starboard post + entry (message deleted, purge).
export async function cleanupStarboardEntry(guild, messageId) {
  const config = await getStarboardConfig(guild.id, { preferCache: true }).catch(() => null);
  if (!config?.channelId) return;

  const entry = await deleteEntry(guild.id, messageId).catch(() => null);
  if (!entry) return;

  const channel = guild.channels.cache.get(config.channelId);
  const posted = await channel?.messages.fetch(entry.starboardMessageId).catch(() => null);
  await posted?.delete().catch(() => {});
}

// Per-source-message serialization: two reactions crossing the threshold in
// the same REST window must not both post a starboard card.
const syncChains = new Map();

function withMessageLock(key, fn) {
  const prev = syncChains.get(key) ?? Promise.resolve();
  const task = prev.catch(() => {}).then(fn);
  syncChains.set(key, task.finally(() => {
    if (syncChains.get(key) === task) syncChains.delete(key);
  }));
  return task;
}

// Shared flow for reaction add/remove events.
export async function handleStarReaction(reaction, logger) {
  if (reaction.partial) {
    reaction = await reaction.fetch().catch(() => null);
    if (!reaction) return;
  }

  const message = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;
  if (!message?.guild) return;

  const guild = message.guild;
  const config = await getStarboardConfig(guild.id, { preferCache: true });
  if (!config.channelId) return;
  if (!reactionMatches(config, reaction.emoji)) return;
  if (message.channelId === config.channelId) return;
  if (config.ignoredChannels.includes(message.channelId)) return;
  if (message.channel?.parentId && config.ignoredChannels.includes(message.channel.parentId)) return;
  if (message.author?.bot) return;

  // Never repost private-channel content to a starboard a wider audience can
  // see: if @everyone can't view the source but can view the board, skip.
  const everyone = guild.roles.everyone;
  const sourceVisible = message.channel?.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel) ?? false;
  if (!sourceVisible) {
    const board = guild.channels.cache.get(config.channelId);
    const boardVisible = board?.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel) ?? false;
    if (boardVisible) return;
  }

  await withMessageLock(`${guild.id}:${message.id}`, async () => {
    const count = await countStars(reaction, message, config);
    await syncStarboardPost({ guild, message, count, config, logger });
  });
}
