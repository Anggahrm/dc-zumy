import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildEmojiUpdate,
  async execute(oldEmoji, newEmoji) {
    const logger = newEmoji.client.zumy?.logger;
    const lines = [
      `- Emoji ID: \`${newEmoji.id ?? "unknown"}\``,
      `- Emoji: ${newEmoji.toString()}`,
    ];

    if (oldEmoji.name !== newEmoji.name) {
      lines.push(`- Name: ${oldEmoji.name ?? "Unknown"} -> ${newEmoji.name ?? "Unknown"}`);
    }

    if (lines.length === 2) return;

    await sendGuildLog({
      guild: newEmoji.guild,
      eventKey: "emojis",
      title: "Emoji Updated",
      color: 0x3498db,
      lines,
      logger,
    });
  },
};
