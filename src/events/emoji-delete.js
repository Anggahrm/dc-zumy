import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildEmojiDelete,
  async execute(emoji) {
    const logger = emoji.client.zumy?.logger;
    await sendGuildLog({
      guild: emoji.guild,
      eventKey: "emojis",
      title: "Emoji Deleted",
      color: 0xed4245,
      lines: [
        `- Name: ${emoji.name ?? "Unknown"}`,
        `- Emoji ID: \`${emoji.id ?? "unknown"}\``,
      ],
      logger,
    });
  },
};
