import { Events } from "discord.js";
import { sendWelcomeGreeting } from "#services/greeter.js";
import { formatError } from "#utils/error.js";

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const logger = member.client.zumy?.logger;
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
  },
};
