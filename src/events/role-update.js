import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    const logger = newRole.client.zumy?.logger;
    const lines = [`- Role: <@&${newRole.id}>`, `- Role ID: \`${newRole.id}\``];

    if (oldRole.name !== newRole.name) {
      lines.push(`- Name: ${oldRole.name} -> ${newRole.name}`);
    }
    if (oldRole.hexColor !== newRole.hexColor) {
      lines.push(`- Color: ${oldRole.hexColor} -> ${newRole.hexColor}`);
    }
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      lines.push("- Permissions updated");
    }

    if (lines.length === 2) return;

    await sendGuildLog({
      guild: newRole.guild,
      eventKey: "role_updates",
      title: "Role Updated",
      color: 0x3498db,
      lines,
      logger,
    });
  },
};
