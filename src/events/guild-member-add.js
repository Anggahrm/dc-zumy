import { Events } from "discord.js";
import { getAutoroleConfig } from "#services/autorole.js";
import { sendWelcomeGreeting } from "#services/greeter.js";
import { sendGuildLog } from "#services/logging.js";
import { formatError } from "#utils/error.js";

function toDateParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function daysInMonthUTC(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function formatElapsedSince(timestamp, now = Date.now()) {
  if (!timestamp) return "unknown";

  const from = new Date(timestamp);
  const to = new Date(now);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return "unknown";
  }

  const start = toDateParts(from);
  const end = toDateParts(to);

  let years = end.year - start.year;
  let months = end.month - start.month;
  let days = end.day - start.day;

  if (days < 0) {
    const prevMonth = end.month - 1 < 0 ? 11 : end.month - 1;
    const prevYear = end.month - 1 < 0 ? end.year - 1 : end.year;
    days += daysInMonthUTC(prevYear, prevMonth);
    months -= 1;
  }

  if (months < 0) {
    months += 12;
    years -= 1;
  }

  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} and ${parts[2]}`;
}

function formatOrdinal(value) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

async function resolveRole(guild, roleId) {
  const cached = guild.roles.cache.get(roleId);
  if (cached) return cached;
  return guild.roles.fetch(roleId).catch(() => null);
}

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const logger = member.client.zumy?.logger;
    let autoroleConfig = null;

    try {
      autoroleConfig = await getAutoroleConfig(member.guild.id);
    } catch (error) {
      const details = formatError(error);
      logger?.error("Failed to read autorole config", {
        guildId: member.guild.id,
        message: details.message,
      });
    }

    if (autoroleConfig) {
      const targetRoleIds = autoroleConfig.roles.filter((roleId) => !autoroleConfig.blacklist.includes(roleId));
      if (targetRoleIds.length > 0) {
        const assignableRoleIds = [];
        const skippedRoleIds = [];

        for (const roleId of targetRoleIds) {
          const role = await resolveRole(member.guild, roleId);
          if (!role || !role.editable) {
            skippedRoleIds.push(roleId);
            continue;
          }
          assignableRoleIds.push(roleId);
        }

        if (assignableRoleIds.length === 0) {
          logger?.warn("Autorole skipped: no assignable roles", {
            guildId: member.guild.id,
            userId: member.id,
            configured: targetRoleIds.length,
          });
        } else {
          try {
            await member.roles.add(assignableRoleIds, "Autorole configuration");
            logger?.info("Autorole applied", {
              guildId: member.guild.id,
              userId: member.id,
              assigned: assignableRoleIds,
              skipped: skippedRoleIds,
            });
          } catch (error) {
            const details = formatError(error);
            logger?.warn("Failed to apply autorole", {
              guildId: member.guild.id,
              userId: member.id,
              message: details.message,
              assignedCount: assignableRoleIds.length,
              skippedCount: skippedRoleIds.length,
            });
          }
        }
      }
    }

    try {
      await sendWelcomeGreeting(member, logger);
    } catch (error) {
      const details = formatError(error);
      logger?.warn("Greeter welcome handler failed", {
        guildId: member.guild.id,
        userId: member.id,
        message: details.message,
      });
    }

    await sendGuildLog({
      guild: member.guild,
      eventKey: "joins",
      title: "Member Joined",
      color: 0x57f287,
      lines: [
        `- <@${member.id}> ${formatOrdinal(member.guild.memberCount)} to join`,
        `- created ${formatElapsedSince(member.user.createdTimestamp)} ago`,
      ],
      actorId: member.id,
      actorName: member.user.tag,
      actorAvatarUrl: member.user.displayAvatarURL({ extension: "png", size: 128 }),
      actorAvatarDescription: `${member.user.tag} avatar`,
      logger,
    });
  },
};
