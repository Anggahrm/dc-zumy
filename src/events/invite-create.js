import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.InviteCreate,
  async execute(invite) {
    if (!invite.guild) return;
    const logger = invite.client.zumy?.logger;
    const inviter = invite.inviter ?? null;
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
      actorId: inviter?.id ?? null,
      actorName: inviter?.tag ?? null,
      actorAvatarUrl: inviter?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
      actorAvatarDescription: inviter?.tag ? `${inviter.tag} avatar` : null,
      logger,
    });
  },
};
