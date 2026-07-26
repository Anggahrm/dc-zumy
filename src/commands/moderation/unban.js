import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { unbanJobKey } from "#services/scheduler-jobs.js";
import { normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

const ID_PATTERN = /^\d{5,30}$/;

registerStrings("unban", {
  en: {
    title: "Moderation",
    invalid_id: "That doesn't look like a valid user ID.",
    not_banned: "That user is not banned from this server.",
    unban_failed: "Unban failed. Please check bot permissions.",
    case_suffix: " — Case #{caseNumber}",
    complete_title: "**Unban Complete**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    reason_line: "- Reason: {reason}",
  },
  id: {
    title: "Moderasi",
    invalid_id: "Itu kelihatannya bukan user ID yang valid.",
    not_banned: "User itu tidak sedang di-ban di server ini.",
    unban_failed: "Unban gagal. Cek permission bot ya.",
    case_suffix: " — Case #{caseNumber}",
    complete_title: "**Unban Selesai**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    reason_line: "- Alasan: {reason}",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("unban.title"), body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.BanMembers],
  },
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by their user ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName("user_id").setDescription("ID of the banned user").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for the unban").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for unban command.");
    }

    const t = ctx.t;
    const userId = interaction.options.getString("user_id", true).trim();
    const reason = normalizeReason(interaction.options.getString("reason"));

    if (!ID_PATTERN.test(userId)) {
      await replyCard(interaction, errorCard(t, t("unban.invalid_id")), { ephemeral: true });
      return;
    }

    const ban = await guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await replyCard(interaction, errorCard(t, t("unban.not_banned")), { ephemeral: true });
      return;
    }

    try {
      await guild.bans.remove(userId, reason);
    } catch {
      await replyCard(interaction, errorCard(t, t("unban.unban_failed")), { ephemeral: true });
      return;
    }

    // Clear any pending tempban auto-unban so a stale job can't fire later.
    await interaction.client.zumy?.scheduler?.cancelByKey(unbanJobKey(guild.id, userId)).catch(() => {});

    const caseRow = await recordCase({
      guild,
      type: "unban",
      target: ban.user ?? { id: userId, tag: null },
      moderator: interaction.user,
      reason,
    });

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: t("unban.title"),
        body: [
          t("unban.complete_title", {
            caseSuffix: caseRow ? t("unban.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
          }),
          t("unban.target_line", { user: ban.user?.tag ?? userId, id: userId }),
          t("unban.moderator_line", { moderator: interaction.user.tag }),
          t("unban.reason_line", { reason }),
        ].join("\n"),
      }),
    );
  },
};
