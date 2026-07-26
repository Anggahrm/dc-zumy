import { Events } from "discord.js";
import { cleanupStarboardEntry } from "#services/starboard.js";

export default {
  name: Events.MessageReactionRemoveAll,
  async execute(message) {
    const guild = message.guild;
    if (!guild) return;

    // All reactions gone means the star count is zero — drop any starboard
    // post for this message.
    await cleanupStarboardEntry(guild, message.id).catch(() => {});
  },
};
