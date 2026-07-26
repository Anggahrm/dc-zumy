import { Events } from "discord.js";
import { handleStarReaction } from "#services/starboard.js";

export default {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    if (user?.bot) return;
    const logger = reaction.client.zumy?.logger;
    await handleStarReaction(reaction, logger);
  },
};
