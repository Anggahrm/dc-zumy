import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildRoleDelete,
  async execute(role) {
    const logger = role.client.zumy?.logger;
    await sendGuildLog({
      guild: role.guild,
      eventKey: "role_deletion",
      title: "Role Deleted",
      color: 0xed4245,
      lines: [
        `- Name: ${role.name}`,
        `- Role ID: \`${role.id}\``,
      ],
      logger,
    });
  },
};
