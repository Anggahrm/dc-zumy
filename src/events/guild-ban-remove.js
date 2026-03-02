import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildBanRemove,
  async execute(ban) {
    const logger = ban.client.zumy?.logger;
    await sendGuildLog({
      guild: ban.guild,
      eventKey: "unbans",
      title: "Member Unbanned",
      color: 0x57f287,
      lines: [
        `- User: **${ban.user?.tag ?? "Unknown user"}**`,
        `- User ID: \`${ban.user?.id ?? "unknown"}\``,
      ],
      logger,
    });
  },
};
