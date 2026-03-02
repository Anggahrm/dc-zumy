import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildRoleCreate,
  async execute(role) {
    const logger = role.client.zumy?.logger;
    await sendGuildLog({
      guild: role.guild,
      eventKey: "role_creation",
      title: "Role Created",
      color: 0x57f287,
      lines: [
        `- Role: <@&${role.id}>`,
        `- Role ID: \`${role.id}\``,
        `- Color: ${role.hexColor}`,
      ],
      logger,
    });
  },
};
