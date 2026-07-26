import { ChannelType, PermissionFlagsBits } from "discord.js";
import { loadGuildFeature } from "#services/guild-config.js";

export const MAX_STATCOUNTERS = 3;
export const STATCOUNTER_TYPES = ["members", "bots", "channels", "roles"];

const STATCOUNTERS_DEFAULTS = {};

function normalizeStatcounters(config) {
  for (const [channelId, entry] of Object.entries(config)) {
    if (
      !/^\d{5,30}$/.test(channelId)
      || !entry
      || typeof entry !== "object"
      || !STATCOUNTER_TYPES.includes(entry.type)
      || typeof entry.template !== "string"
      || !entry.template.includes("{count}")
    ) {
      delete config[channelId];
    }
  }
}

export async function getStatcounters(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "statcounters", STATCOUNTERS_DEFAULTS, normalizeStatcounters, options);
  return Object.fromEntries(Object.entries(config).map(([channelId, entry]) => [channelId, { ...entry }]));
}

export async function addStatcounter(guildId, channelId, { type, template }) {
  const config = await loadGuildFeature(guildId, "statcounters", STATCOUNTERS_DEFAULTS, normalizeStatcounters);
  if (!config[channelId] && Object.keys(config).length >= MAX_STATCOUNTERS) {
    return false;
  }
  config[channelId] = { type, template };
  return true;
}

export async function removeStatcounter(guildId, channelId) {
  const config = await loadGuildFeature(guildId, "statcounters", STATCOUNTERS_DEFAULTS, normalizeStatcounters);
  if (!config[channelId]) return false;
  delete config[channelId];
  return true;
}

export function computeStat(guild, type) {
  if (type === "members") return guild.memberCount;
  if (type === "bots") return guild.members.cache.filter((member) => member.user.bot).size;
  if (type === "channels") return guild.channels.cache.size;
  if (type === "roles") return guild.roles.cache.size;
  return 0;
}

export function renderCounterName(template, count) {
  return template.replaceAll("{count}", String(count)).slice(0, 100);
}

// Renames configured counter channels when the value changed. Discord limits
// channel renames to 2 per 10 minutes, so this must only run from a slow tick.
export async function refreshStatcounters(guild, logger) {
  const counters = await getStatcounters(guild.id);
  const entries = Object.entries(counters);
  if (entries.length === 0) return;

  for (const [channelId, entry] of entries) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      await removeStatcounter(guild.id, channelId).catch(() => {});
      continue;
    }

    const name = renderCounterName(entry.template, computeStat(guild, entry.type));
    if (channel.name === name) continue;

    await channel.setName(name, "Stat counter refresh").catch((error) => {
      logger?.warn("Stat counter rename failed", {
        guildId: guild.id,
        channelId,
        message: error?.message || String(error),
      });
    });
  }
}

export async function createCounterChannel(guild, { type, template }) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return null;

  const name = renderCounterName(template, computeStat(guild, type));
  return guild.channels
    .create({
      name,
      type: ChannelType.GuildVoice,
      position: 0,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] },
        { id: me.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] },
      ],
      reason: "Stat counter channel",
    })
    .catch(() => null);
}
