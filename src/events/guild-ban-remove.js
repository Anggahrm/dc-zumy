import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";
import { unbanJobKey } from "#services/scheduler-jobs.js";

export default {
  name: Events.GuildBanRemove,
  async execute(ban) {
    const logger = ban.client.zumy?.logger;
    const user = ban.user ?? null;

    // Any unban (bot, mod, or Discord UI) invalidates a pending tempban job.
    if (user?.id) {
      await ban.client.zumy?.scheduler?.cancelByKey(unbanJobKey(ban.guild.id, user.id)).catch(() => {});
    }
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
