import {
  fetchYoutubeFeed,
  getAlerts,
  renderAlertMessage,
  setAlertLastVideo,
} from "#services/alerts.js";
import { automessageJobKey, getAutomessages, renderAutomessage } from "#services/automessages.js";
import {
  getBirthdaysConfig,
  isBirthdayOn,
  nextUtcMidnight,
  renderBirthdayMessage,
  updateBirthdaysConfig,
} from "#services/birthdays.js";
import { recordCase } from "#services/cases.js";
import { finishGiveaway } from "#services/giveaways.js";
import { getGuildLanguage } from "#services/i18n.js";
import { getModConfig } from "#services/mod-config.js";
import { refreshStatcounters } from "#services/statcounters.js";

export function unbanJobKey(guildId, userId) {
  return `unban:${guildId}:${userId}`;
}

export function giveawayJobKey(giveawayId) {
  return `giveaway:${giveawayId}`;
}

export function unmuteJobKey(guildId, userId) {
  return `unmute:${guildId}:${userId}`;
}

export function temproleJobKey(guildId, userId, roleId) {
  return `temprole:${guildId}:${userId}:${roleId}`;
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

const BIRTHDAY_TICK_KEY = "birthday:tick";
const ALERTS_TICK_KEY = "alerts:tick";
const ALERTS_INTERVAL_MS = 10 * 60 * 1000;

async function runAlertsTickForGuild(guild, logger) {
  const alerts = await getAlerts(guild.id);
  const names = Object.keys(alerts);
  if (names.length === 0) return;

  for (const name of names) {
    const alert = alerts[name];
    const feed = await fetchYoutubeFeed(alert.youtubeChannelId);
    if (!feed || feed.videos.length === 0) continue;

    const newest = feed.videos[0];
    if (alert.lastVideoId === newest.videoId) continue;

    // Announce everything newer than the last seen id, oldest first, max 3.
    const lastIndex = alert.lastVideoId
      ? feed.videos.findIndex((video) => video.videoId === alert.lastVideoId)
      : 1;
    const fresh = (lastIndex === -1 ? feed.videos.slice(0, 3) : feed.videos.slice(0, lastIndex)).reverse();

    const channel = guild.channels.cache.get(alert.targetChannelId)
      ?? (await guild.channels.fetch(alert.targetChannelId).catch(() => null));

    if (channel?.isTextBased() && typeof channel.send === "function") {
      for (const video of fresh) {
        await channel
          .send({
            content: renderAlertMessage(alert.message, { video, guildName: guild.name }),
            allowedMentions: { parse: [] },
          })
          .catch((error) => {
            logger?.warn("Alert announce failed", {
              guildId: guild.id,
              name,
              message: error?.message || String(error),
            });
          });
      }
    }

    await setAlertLastVideo(guild.id, name, newest.videoId);
  }
}

async function runBirthdayTickForGuild(guild, logger) {
  const config = await getBirthdaysConfig(guild.id, { preferCache: false });
  const hasEntries = Object.keys(config.entries).length > 0;
  if (!config.channelId || !hasEntries) return;

  const today = new Date();
  const celebrating = Object.entries(config.entries)
    .filter(([, entry]) => isBirthdayOn(entry, today))
    .map(([userId]) => userId);

  const role = config.roleId ? guild.roles.cache.get(config.roleId) : null;

  // Remove yesterday's birthday role before assigning today's.
  if (role) {
    for (const userId of config.activeRoleUserIds) {
      if (celebrating.includes(userId)) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      await member?.roles.remove(role, "Birthday over").catch(() => {});
    }
  }

  const celebrated = [];
  for (const userId of celebrating) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    celebrated.push(userId);
    if (role) {
      await member.roles.add(role, "Birthday!").catch(() => {});
    }
  }

  await updateBirthdaysConfig(guild.id, (stored) => {
    stored.activeRoleUserIds = role ? celebrated : [];
  });

  if (celebrated.length === 0) return;

  const channel = guild.channels.cache.get(config.channelId)
    ?? (await guild.channels.fetch(config.channelId).catch(() => null));
  if (!channel?.isTextBased() || typeof channel.send !== "function") return;

  const language = await getGuildLanguage(guild.id);
  for (const userId of celebrated) {
    await channel
      .send({
        content: renderBirthdayMessage(config.message, { userId, guildName: guild.name, language }),
        allowedMentions: { users: [userId] },
      })
      .catch((error) => {
        logger?.warn("Failed to send birthday message", {
          guildId: guild.id,
          userId,
          message: error?.message || String(error),
        });
      });
  }
}

export function registerDefaultJobs({ scheduler, client, logger }) {
  scheduler.registerHandler("birthday_tick", async () => {
    // Reschedule first so the daily chain survives any per-guild failure.
    await scheduler.schedule({
      type: "birthday_tick",
      runAt: nextUtcMidnight(),
      dedupeKey: BIRTHDAY_TICK_KEY,
    });

    for (const guild of client.guilds.cache.values()) {
      try {
        await runBirthdayTickForGuild(guild, logger);
      } catch (error) {
        logger?.warn("Birthday tick failed for guild", {
          guildId: guild.id,
          message: error?.message || String(error),
        });
      }
    }
  }, { recurring: true, recurringResetMs: 60 * 60 * 1000 });

  scheduler.registerHandler("alerts_tick", async () => {
    // Reschedule first and detach the slow polling work so RSS fetches never
    // block time-sensitive jobs (unbans, unmutes, reminders) in the queue.
    await scheduler.schedule({
      type: "alerts_tick",
      runAt: new Date(Date.now() + ALERTS_INTERVAL_MS),
      dedupeKey: ALERTS_TICK_KEY,
    });

    void (async () => {
      for (const guild of client.guilds.cache.values()) {
        try {
          await runAlertsTickForGuild(guild, logger);
        } catch (error) {
          logger?.warn("Alerts tick failed for guild", {
            guildId: guild.id,
            message: error?.message || String(error),
          });
        }

        // Stat counters piggyback on the same 10-minute cadence, which also
        // respects Discord's 2-renames-per-10-minutes channel limit.
        try {
          await refreshStatcounters(guild, logger);
        } catch (error) {
          logger?.warn("Stat counter refresh failed for guild", {
            guildId: guild.id,
            message: error?.message || String(error),
          });
        }
      }
    })();
  }, { recurring: true, recurringResetMs: ALERTS_INTERVAL_MS });

  // Seed the recurring ticks only when absent: an overdue row left from
  // downtime must fire (announcing the missed day) rather than be replaced
  // with tomorrow's.
  void scheduler
    .schedule({ type: "birthday_tick", runAt: nextUtcMidnight(), dedupeKey: BIRTHDAY_TICK_KEY, ifAbsent: true })
    .catch((error) => {
      logger?.warn("Failed to schedule birthday tick", { message: error?.message || String(error) });
    });
  void scheduler
    .schedule({
      type: "alerts_tick",
      runAt: new Date(Date.now() + ALERTS_INTERVAL_MS),
      dedupeKey: ALERTS_TICK_KEY,
      ifAbsent: true,
    })
    .catch((error) => {
      logger?.warn("Failed to schedule alerts tick", { message: error?.message || String(error) });
    });
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

  scheduler.registerHandler("automessage", async (job) => {
    const guild = await resolveGuild(client, job.guildId);
    if (!guild) return;

    const name = job.payload?.name;
    if (!name) return;

    const automessages = await getAutomessages(guild.id);
    const entry = automessages[name];
    // Deleted config: stop the recurrence by simply not rescheduling.
    if (!entry) return;

    const channel = guild.channels.cache.get(entry.channelId)
      ?? (await guild.channels.fetch(entry.channelId).catch(() => null));
    if (channel?.isTextBased() && typeof channel.send === "function") {
      await channel
        .send({
          content: renderAutomessage(entry.content, { guildName: guild.name }),
          allowedMentions: { parse: [] },
        })
        .catch((error) => {
          logger?.warn("Automessage send failed", {
            guildId: guild.id,
            name,
            message: error?.message || String(error),
          });
        });
    }

    await scheduler.schedule({
      type: "automessage",
      runAt: new Date(Date.now() + entry.intervalMs),
      guildId: guild.id,
      payload: { name },
      dedupeKey: automessageJobKey(guild.id, name),
    });
  }, { recurring: true, recurringResetMs: 30 * 60 * 1000 });

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

  scheduler.registerHandler("temprole_remove", async (job) => {
    const guild = await resolveGuild(client, job.guildId);
    if (!guild) return;

    const { userId, roleId } = job.payload ?? {};
    if (!userId || !roleId) return;

    const role = guild.roles.cache.get(roleId);
    if (!role) return;

    const member = await fetchOrNull(guild.members.fetch(userId), [UNKNOWN_MEMBER]);
    if (!member || !member.roles.cache.has(roleId)) return;

    await member.roles.remove(role, "Temporary role expired");
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
