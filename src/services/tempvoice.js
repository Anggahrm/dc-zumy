import { ChannelType, PermissionFlagsBits } from "discord.js";
import { loadGuildFeature } from "#services/guild-config.js";

const TEMPVOICE_DEFAULTS = {
  triggerChannelId: null,
  active: [],
};

function normalizeTempvoice(config) {
  if (typeof config.triggerChannelId !== "string") config.triggerChannelId = null;
  if (!Array.isArray(config.active)) config.active = [];
}

export async function getTempvoiceConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "tempvoice", TEMPVOICE_DEFAULTS, normalizeTempvoice, options);
  return { triggerChannelId: config.triggerChannelId, active: [...config.active] };
}

export async function setTempvoiceTrigger(guildId, channelId) {
  const config = await loadGuildFeature(guildId, "tempvoice", TEMPVOICE_DEFAULTS, normalizeTempvoice);
  config.triggerChannelId = channelId;
}

export async function addActiveTempChannel(guildId, channelId) {
  const config = await loadGuildFeature(guildId, "tempvoice", TEMPVOICE_DEFAULTS, normalizeTempvoice);
  if (!config.active.includes(channelId)) {
    config.active = [...config.active, channelId].slice(-100);
  }
}

export async function removeActiveTempChannel(guildId, channelId) {
  const config = await loadGuildFeature(guildId, "tempvoice", TEMPVOICE_DEFAULTS, normalizeTempvoice);
  if (config.active.includes(channelId)) {
    config.active = config.active.filter((id) => id !== channelId);
  }
}

export async function createTempChannel(guild, member, triggerChannel) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return null;

  const channel = await guild.channels
    .create({
      name: `🔊 ${member.displayName}`.slice(0, 100),
      type: ChannelType.GuildVoice,
      parent: triggerChannel.parentId ?? null,
      permissionOverwrites: [
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.Connect,
          ],
        },
        {
          id: me.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels],
        },
      ],
      reason: `Temp voice for ${member.user.tag}`,
    })
    .catch(() => null);

  if (!channel) return null;
  await addActiveTempChannel(guild.id, channel.id);
  return channel;
}

// Deletes empty temp channels; also lazily cleans orphans (deleted or empty
// channels left over from a restart).
export async function cleanupTempChannels(guild) {
  const config = await getTempvoiceConfig(guild.id, { preferCache: true });
  if (config.active.length === 0) return;

  for (const channelId of config.active) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      await removeActiveTempChannel(guild.id, channelId);
      continue;
    }

    const humans = channel.members?.filter((member) => !member.user.bot).size ?? 0;
    if (humans === 0) {
      await channel.delete("Temp voice channel empty").catch(() => {});
      await removeActiveTempChannel(guild.id, channelId);
    }
  }
}

// Called from voiceStateUpdate: spawns a channel when someone enters the
// trigger, and cleans up after leaves.
export async function handleTempvoiceUpdate(oldState, newState, logger) {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;

  let config;
  try {
    config = await getTempvoiceConfig(guild.id, { preferCache: true });
  } catch {
    return;
  }
  if (!config.triggerChannelId) return;

  if (newState.channelId === config.triggerChannelId && newState.member && !newState.member.user.bot) {
    const trigger = guild.channels.cache.get(config.triggerChannelId);
    if (trigger) {
      const channel = await createTempChannel(guild, newState.member, trigger);
      if (channel) {
        await newState.setChannel(channel, "Temp voice created").catch(() => {
          channel.delete("Move failed").catch(() => {});
          removeActiveTempChannel(guild.id, channel.id).catch(() => {});
        });
      } else {
        logger?.warn("Temp voice creation failed", { guildId: guild.id, userId: newState.member.id });
      }
    }
  }

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    await cleanupTempChannels(guild);
  }
}
