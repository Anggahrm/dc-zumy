import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.InviteDelete,
  async execute(invite) {
    if (!invite.guild) return;
    const logger = invite.client.zumy?.logger;
    await sendGuildLog({
      guild: invite.guild,
      eventKey: "discord_invites",
      title: "Invite Deleted",
      color: 0xed4245,
      lines: [
        `- Code: \`${invite.code}\``,
        `- Channel: ${invite.channelId ? `<#${invite.channelId}>` : "Unknown channel"}`,
      ],
      logger,
    });
  },
};
