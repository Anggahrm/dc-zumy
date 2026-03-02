import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";
import { MessageFlags } from "discord.js";
import { createCard } from "#utils/respond.js";

const LOG_EVENT_META = {
  deleted_messages: { key: "deleted_messages", label: "Deleted messages" },
  edited_messages: { key: "edited_messages", label: "Edited messages" },
  purged_messages: { key: "purged_messages", label: "Purged messages" },
  discord_invites: { key: "discord_invites", label: "Discord invites" },
  member_roles: { key: "member_roles", label: "Member roles" },
  name_updates: { key: "name_updates", label: "Name updates" },
  avatar_updates: { key: "avatar_updates", label: "Avatar updates" },
  bans: { key: "bans", label: "Bans" },
  unbans: { key: "unbans", label: "Unbans" },
  joins: { key: "joins", label: "Joins" },
  leaves: { key: "leaves", label: "Leaves" },
  timeouts: { key: "timeouts", label: "Timeouts" },
  remove_timeouts: { key: "remove_timeouts", label: "Remove Timeouts" },
  voice_join: { key: "voice_join", label: "Voice join" },
  voice_move: { key: "voice_move", label: "Voice move" },
  voice_leave: { key: "voice_leave", label: "Voice leave" },
  channel_create: { key: "channel_create", label: "Channel create" },
  channel_update: { key: "channel_update", label: "Channel update" },
  channel_delete: { key: "channel_delete", label: "Channel delete" },
  role_creation: { key: "role_creation", label: "Role creation" },
  role_updates: { key: "role_updates", label: "Role updates" },
  role_deletion: { key: "role_deletion", label: "Role deletion" },
  server_updates: { key: "server_updates", label: "Server updates" },
  emojis: { key: "emojis", label: "Emojis" },
};

export const LOG_EVENT_ORDER = [
  "deleted_messages",
  "edited_messages",
  "purged_messages",
  "discord_invites",
  "member_roles",
  "name_updates",
  "avatar_updates",
  "bans",
  "unbans",
  "joins",
  "leaves",
  "timeouts",
  "remove_timeouts",
  "voice_join",
  "voice_move",
  "voice_leave",
  "channel_create",
  "channel_update",
  "channel_delete",
  "role_creation",
  "role_updates",
  "role_deletion",
  "server_updates",
  "emojis",
];

const LOGGING_DEFAULTS = {
  channelId: null,
  events: {
    deleted_messages: false,
    edited_messages: false,
    purged_messages: false,
    discord_invites: false,
    member_roles: false,
    name_updates: false,
    avatar_updates: false,
    bans: false,
    unbans: false,
    joins: false,
    leaves: false,
    timeouts: false,
    remove_timeouts: false,
    voice_join: false,
    voice_move: false,
    voice_leave: false,
    channel_create: false,
    channel_update: false,
    channel_delete: false,
    role_creation: false,
    role_updates: false,
    role_deletion: false,
    server_updates: false,
    emojis: false,
  },
};

function normalizeLogging(config) {
  config.channelId = guildFeatureUtils.sanitizeChannelId(config.channelId);

  if (!config.events || typeof config.events !== "object" || Array.isArray(config.events)) {
    config.events = { ...LOGGING_DEFAULTS.events };
    return;
  }

  for (const key of LOG_EVENT_ORDER) {
    if (typeof config.events[key] !== "boolean") {
      config.events[key] = LOGGING_DEFAULTS.events[key];
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

  const channel = guild.channels.cache.get(config.channelId)
    ?? (await guild.channels.fetch(config.channelId).catch(() => null));

  if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
    return { config, channel: null };
  }

  return { config, channel };
}

export async function sendGuildLog({ guild, eventKey, title, lines, color = 0x3498db, logger }) {
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
