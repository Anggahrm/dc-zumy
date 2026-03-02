import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;
    const logger = channel.client.zumy?.logger;

    await sendGuildLog({
      guild: channel.guild,
      eventKey: "channel_delete",
      title: "Channel Deleted",
      color: 0xed4245,
      lines: [
        `- Name: ${channel.name ?? "Unknown channel"}`,
        `- Channel ID: \`${channel.id}\``,
        `- Type: ${channel.type}`,
      ],
      logger,
    });
  },
};
