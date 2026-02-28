import { Events } from "discord.js";

export default {
  name: Events.GuildCreate,
  execute(guild) {
    const logger = guild.client.zumy?.logger;
    logger?.info("Joined guild", {
      guildId: guild.id,
      guildName: guild.name,
      members: guild.memberCount,
    });
  },
};
