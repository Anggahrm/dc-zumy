import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

export default {
  name: Events.GuildBanAdd,
  async execute(ban) {
    const logger = ban.client.zumy?.logger;
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
      logger,
    });
  },
};
