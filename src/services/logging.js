import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";
import { MessageFlags } from "discord.js";
import { createCard } from "#utils/respond.js";
import { formatDiscordTimestamp } from "#utils/time.js";
import { createDefaultLogEvents, LOG_EVENT_META, LOG_EVENT_ORDER } from "#config/log-events.js";

export { LOG_EVENT_ORDER } from "#config/log-events.js";

const CHANNEL_MISS_TTL_MS = 5 * 60 * 1000;
const channelMisses = new Map();

const LOGGING_DEFAULTS = {
  channelId: null,
  events: createDefaultLogEvents(),
};

function normalizeLogging(config) {
  config.channelId = guildFeatureUtils.sanitizeChannelId(config.channelId);

  if (!config.events || typeof config.events !== "object" || Array.isArray(config.events)) {
    config.events = createDefaultLogEvents();
    return;
  }

  for (const key of LOG_EVENT_ORDER) {
    if (typeof config.events[key] !== "boolean") {
      config.events[key] = false;
    }
  }
}

function cloneConfig(config) {
  return {
    channelId: config.channelId,
    events: { ...config.events },
  };
}

export function getLogEventMeta(eventKey) {
  return LOG_EVENT_META[eventKey] ?? null;
}

export function isValidLogEventKey(eventKey) {
  return LOG_EVENT_ORDER.includes(eventKey);
}

export async function getLoggingConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "logging", LOGGING_DEFAULTS, normalizeLogging, options);
  return cloneConfig(config);
}

export async function setLoggingChannel(guildId, channelId) {
  const config = await loadGuildFeature(guildId, "logging", LOGGING_DEFAULTS, normalizeLogging);
  config.channelId = guildFeatureUtils.sanitizeChannelId(channelId);
  channelMisses.delete(guildId);
  return cloneConfig(config);
}

export async function setLoggingEvent(guildId, eventKey, enabled) {
  if (!isValidLogEventKey(eventKey)) {
    throw new Error(`Invalid logging event key: ${eventKey}`);
  }

  const config = await loadGuildFeature(guildId, "logging", LOGGING_DEFAULTS, normalizeLogging);
  config.events[eventKey] = Boolean(enabled);
  return cloneConfig(config);
}

export async function resolveLoggingTarget(guild, configOverride = null) {
  const config = configOverride ?? await getLoggingConfig(guild.id, { preferCache: true });
  if (!config.channelId) {
    return { config, channel: null };
  }

  const cached = guild.channels.cache.get(config.channelId);
  if (!cached) {
    // Negative-cache missing channels so a deleted log channel doesn't cost
    // one REST fetch per logged event.
    const miss = channelMisses.get(guild.id);
    if (miss && miss.channelId === config.channelId && Date.now() - miss.at < CHANNEL_MISS_TTL_MS) {
      return { config, channel: null };
    }
  }

  const channel = cached ?? (await guild.channels.fetch(config.channelId).catch(() => null));

  if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
    channelMisses.set(guild.id, { channelId: config.channelId, at: Date.now() });
    return { config, channel: null };
  }

  channelMisses.delete(guild.id);
  return { config, channel };
}

export async function sendGuildLog({
  guild,
  eventKey,
  title,
  lines,
  color = 0x3498db,
  actorId = null,
  actorName = null,
  actorAvatarUrl = null,
  actorAvatarDescription = null,
  thumbnailUrl = null,
  thumbnailDescription = null,
  footer = null,
  logger,
}) {
  if (!guild || !eventKey || !Array.isArray(lines) || lines.length === 0) {
    return false;
  }

  const config = await getLoggingConfig(guild.id, { preferCache: true });
  if (!config.events[eventKey]) {
    return false;
  }

  const { channel } = await resolveLoggingTarget(guild, config);
  if (!channel) {
    return false;
  }

  const card = createCard({
    color,
    title,
    body: lines.join("\n"),
    actorName,
    actorAvatarUrl,
    actorAvatarDescription,
    thumbnailUrl,
    thumbnailDescription,
    footer: footer?.trim()
      ? footer
      : (actorId ? `ID: ${actorId} | ` : "") + formatDiscordTimestamp(new Date(), "F"),
  });

  try {
    await channel.send({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: {
        parse: [],
      },
    });
    return true;
  } catch (error) {
    logger?.warn("Failed to send logging message", {
      guildId: guild.id,
      channelId: config.channelId,
      eventKey,
      message: error?.message || String(error),
    });
    return false;
  }
}
