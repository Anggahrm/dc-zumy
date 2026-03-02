import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild) return;
    const logger = channel.client.zumy?.logger;

    await sendGuildLog({
      guild: channel.guild,
      eventKey: "channel_create",
      title: "Channel Created",
      color: 0x57f287,
      lines: [
        `- Channel: <#${channel.id}>`,
        `- Type: ${channel.type}`,
        `- Channel ID: \`${channel.id}\``,
      ],
      logger,
    });
  },
};
