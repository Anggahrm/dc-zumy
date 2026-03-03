import { Events } from "discord.js";
import { sendLeaveGreeting } from "#services/greeter.js";
import { sendGuildLog } from "#services/logging.js";
import { formatError } from "#utils/error.js";
import { formatElapsedSince } from "#utils/time.js";

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
