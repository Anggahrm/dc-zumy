import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildBanRemove,
  async execute(ban) {
    const logger = ban.client.zumy?.logger;
    const user = ban.user ?? null;
    await sendGuildLog({
      guild: ban.guild,
      eventKey: "unbans",
      title: "Member Unbanned",
      color: 0x57f287,
      lines: [
        `- User: **${ban.user?.tag ?? "Unknown user"}**`,
        `- User ID: \`${ban.user?.id ?? "unknown"}\``,
      ],
      actorId: user?.id ?? null,
      actorName: user?.tag ?? null,
      actorAvatarUrl: user?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
      actorAvatarDescription: user?.tag ? `${user.tag} avatar` : null,
      logger,
    });
  },
};
