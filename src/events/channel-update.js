import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    const logger = newChannel.client.zumy?.logger;

    const lines = [`- Channel: <#${newChannel.id}>`, `- Channel ID: \`${newChannel.id}\``];
    if (oldChannel.name !== newChannel.name) {
      lines.push(`- Name: ${oldChannel.name ?? "(none)"} -> ${newChannel.name ?? "(none)"}`);
    }
    if (oldChannel.topic !== newChannel.topic) {
      lines.push("- Topic updated");
    }
    if (oldChannel.type !== newChannel.type) {
      lines.push(`- Type: ${oldChannel.type} -> ${newChannel.type}`);
    }

    if (lines.length === 2) return;

    await sendGuildLog({
      guild: newChannel.guild,
      eventKey: "channel_update",
      title: "Channel Updated",
      color: 0x3498db,
      lines,
      logger,
    });
  },
};
