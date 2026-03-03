import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildBanAdd,
  async execute(ban) {
    const logger = ban.client.zumy?.logger;
    const user = ban.user ?? null;
    await sendGuildLog({
      guild: ban.guild,
      eventKey: "bans",
      title: "Member Banned",
      color: 0xed4245,
      lines: [
        `- User: **${ban.user?.tag ?? "Unknown user"}**`,
        `- User ID: \`${ban.user?.id ?? "unknown"}\``,
        `- Reason: ${ban.reason?.trim() || "No reason provided."}`,
      ],
      actorId: user?.id ?? null,
      actorName: user?.tag ?? null,
      actorAvatarUrl: user?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
      actorAvatarDescription: user?.tag ? `${user.tag} avatar` : null,
      logger,
    });
  },
};
