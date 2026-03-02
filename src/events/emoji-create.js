import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildEmojiCreate,
  async execute(emoji) {
    const logger = emoji.client.zumy?.logger;
    await sendGuildLog({
      guild: emoji.guild,
      eventKey: "emojis",
      title: "Emoji Created",
      color: 0x57f287,
      lines: [
        `- Emoji: ${emoji.toString()}`,
        `- Name: ${emoji.name ?? "Unknown"}`,
        `- Emoji ID: \`${emoji.id ?? "unknown"}\``,
      ],
      logger,
    });
  },
};
