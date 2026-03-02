import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.InviteCreate,
  async execute(invite) {
    if (!invite.guild) return;
    const logger = invite.client.zumy?.logger;
    await sendGuildLog({
      guild: invite.guild,
      eventKey: "discord_invites",
      title: "Invite Created",
      color: 0x57f287,
      lines: [
        `- Code: \`${invite.code}\``,
        `- Channel: ${invite.channelId ? `<#${invite.channelId}>` : "Unknown channel"}`,
        `- Inviter: ${invite.inviter ? `**${invite.inviter.tag}**` : "Unknown"}`,
      ],
      logger,
    });
  },
};
