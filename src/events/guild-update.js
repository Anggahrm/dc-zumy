import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildUpdate,
  async execute(oldGuild, newGuild) {
    const logger = newGuild.client.zumy?.logger;
    const lines = [`- Guild ID: \`${newGuild.id}\``];

    if (oldGuild.name !== newGuild.name) {
      lines.push(`- Name: ${oldGuild.name} -> ${newGuild.name}`);
    }
    if (oldGuild.icon !== newGuild.icon) {
      lines.push("- Icon updated");
    }
    if (oldGuild.ownerId !== newGuild.ownerId) {
      lines.push(`- Owner ID: \`${oldGuild.ownerId}\` -> \`${newGuild.ownerId}\``);
    }

    if (lines.length === 1) return;

    await sendGuildLog({
      guild: newGuild,
      eventKey: "server_updates",
      title: "Server Updated",
      color: 0x3498db,
      lines,
      logger,
    });
  },
};
