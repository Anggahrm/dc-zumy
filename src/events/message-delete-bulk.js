import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    const guild = channel?.guild ?? messages.first()?.guild;
    if (!guild) return;

    const logger = channel?.client?.zumy?.logger;
    await sendGuildLog({
      guild,
      eventKey: "purged_messages",
      title: "Purged Messages",
      color: 0xed4245,
      lines: [
        `- Channel: ${channel?.id ? `<#${channel.id}>` : "Unknown channel"}`,
        `- Deleted count: **${messages.size}**`,
      ],
      logger,
    });
  },
};
