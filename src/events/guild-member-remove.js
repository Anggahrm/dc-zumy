import { Events } from "discord.js";
import { sendLeaveGreeting } from "#services/greeter.js";
import { formatError } from "#utils/error.js";

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
  },
};
