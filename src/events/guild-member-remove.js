import { Events } from "discord.js";
import { sendLeaveGreeting } from "#services/greeter.js";
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

function formatRoleList(roles) {
  const roleMentions = roles
    .filter((role) => role.id !== role.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => `<@&${role.id}>`);

  return roleMentions.length > 0 ? roleMentions.join(", ") : "(none)";
}

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const logger = member.client.zumy?.logger;
    try {
      await sendLeaveGreeting(member, logger);
    } catch (error) {
      const details = formatError(error);
      logger?.warn("Greeter leave handler failed", {
        guildId: member.guild.id,
        userId: member.id,
        message: details.message,
      });
    }

    await sendGuildLog({
      guild: member.guild,
      eventKey: "leaves",
      title: "Member Left",
      color: 0xed4245,
      lines: [
        `- <@${member.id}> joined ${formatElapsedSince(member.joinedTimestamp)} ago`,
        `- **Roles:** ${formatRoleList(Array.from(member.roles.cache.values()))}`,
      ],
      actorId: member.id,
      actorName: member.user?.tag ?? member.id,
      actorAvatarUrl: member.user?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
      actorAvatarDescription: `${member.user?.tag ?? member.id} avatar`,
      logger,
    });
  },
};
