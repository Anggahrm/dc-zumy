import { Events } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    const logger = client.zumy?.logger;
    logger?.info("Bot ready", {
      user: client.user?.tag,
      commands: client.zumy?.registry.size(),
    });
  },
};
