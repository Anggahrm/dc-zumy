import { recordCase } from "#services/cases.js";
import { finishGiveaway } from "#services/giveaways.js";
import { getModConfig } from "#services/mod-config.js";

export function unbanJobKey(guildId, userId) {
  return `unban:${guildId}:${userId}`;
}

export function giveawayJobKey(giveawayId) {
  return `giveaway:${giveawayId}`;
}

export function unmuteJobKey(guildId, userId) {
  return `unmute:${guildId}:${userId}`;
}

const UNKNOWN_GUILD = 10004;
const UNKNOWN_MEMBER = 10007;
const UNKNOWN_BAN = 10026;

// Distinguishes "target is gone, job is moot" (returns null) from transient
// failures (throws, so the scheduler retries).
async function fetchOrNull(promise, goneCodes) {
  try {
    return await promise;
  } catch (error) {
    if (goneCodes.includes(error?.code)) return null;
    throw error;
  }
}

async function resolveGuild(client, guildId) {
  if (!guildId) return null;
  return client.guilds.cache.get(guildId)
    ?? (await fetchOrNull(client.guilds.fetch(guildId), [UNKNOWN_GUILD]));
}

export function registerDefaultJobs({ scheduler, client, logger }) {
  scheduler.registerHandler("unban", async (job) => {
    const guild = await resolveGuild(client, job.guildId);
    if (!guild) return;

    const userId = job.payload?.userId;
    if (!userId) return;

    const ban = await fetchOrNull(guild.bans.fetch(userId), [UNKNOWN_BAN]);
    if (!ban) return;

    await guild.bans.remove(userId, "Tempban expired");
    await recordCase({
      guild,
      type: "unban",
      target: ban.user ?? { id: userId, tag: null },
      moderator: client.user,
      reason: "Tempban expired",
      metadata: { source: "scheduler", caseNumber: job.payload?.caseNumber },
      logger,
    });
  });

  scheduler.registerHandler("reminder", async (job) => {
    const { userId, channelId, text } = job.payload ?? {};
    if (!userId || !text) return;

    const content = `⏰ <@${userId}> Reminder: ${text}`;
    const channel = channelId
      ? await client.channels.fetch(channelId).catch(() => null)
      : null;

    if (channel?.isTextBased() && typeof channel.send === "function") {
      const sent = await channel
        .send({ content, allowedMentions: { users: [userId] } })
        .then(() => true)
        .catch(() => false);
      if (sent) return;
    }

    const user = await client.users.fetch(userId).catch(() => null);
    await user?.send({ content: `⏰ Reminder: ${text}` }).catch(() => {});
  });

  scheduler.registerHandler("giveaway_end", async (job) => {
    const guild = await resolveGuild(client, job.guildId);
    if (!guild) return;

    const giveawayId = job.payload?.giveawayId;
    if (!Number.isInteger(giveawayId)) return;

    await finishGiveaway({ guild, giveawayId, logger });
  });

  scheduler.registerHandler("unmute", async (job) => {
    const guild = await resolveGuild(client, job.guildId);
    if (!guild) return;

    const userId = job.payload?.userId;
    if (!userId) return;

    const { muteRoleId } = await getModConfig(guild.id);
    if (!muteRoleId) return;

    const member = await fetchOrNull(guild.members.fetch(userId), [UNKNOWN_MEMBER]);
    if (!member || !member.roles.cache.has(muteRoleId)) return;

    await member.roles.remove(muteRoleId, "Mute expired");
    await recordCase({
      guild,
      type: "unmute",
      target: member.user,
      moderator: client.user,
      reason: "Mute expired",
      metadata: { source: "scheduler" },
      logger,
    });
  });
}
