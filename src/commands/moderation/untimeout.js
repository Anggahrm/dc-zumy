import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("untimeout", {
  en: {
    title: "Moderation",
    not_in_server: "That user isn't in this server.",
    not_timed_out: "**{user}** isn't timed out.",
    untimeout_failed: "I couldn't remove the timeout. Check my role position and permissions.",
    case_suffix: " — Case #{caseNumber}",
    removed_title: "**Timeout Removed**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    reason_line: "- Reason: {reason}",
  },
  id: {
    title: "Moderasi",
    not_in_server: "User itu tidak ada di server ini.",
    not_timed_out: "**{user}** tidak sedang kena timeout.",
    untimeout_failed: "Gagal mencabut timeout. Cek posisi role dan permission-ku ya.",
    case_suffix: " — Case #{caseNumber}",
    removed_title: "**Timeout Dicabut**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    reason_line: "- Alasan: {reason}",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("untimeout.title"), body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's timeout")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to release").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for untimeout command.");
    }

    const t = ctx.t;
    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) {
      await replyCard(interaction, errorCard(t, t("untimeout.not_in_server")), { ephemeral: true });
      return;
    }

    if (!targetMember.isCommunicationDisabled()) {
      await replyCard(interaction, errorCard(t, t("untimeout.not_timed_out", { user: target.tag })), { ephemeral: true });
      return;
    }

    try {
      await targetMember.timeout(null, reason);
    } catch {
      await replyCard(
        interaction,
        errorCard(t, t("untimeout.untimeout_failed")),
        { ephemeral: true },
      );
      return;
    }

    const caseRow = await recordCase({
      guild,
      type: "untimeout",
      target,
      moderator: interaction.user,
      reason,
    });

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: t("untimeout.title"),
        body: [
          t("untimeout.removed_title", {
            caseSuffix: caseRow ? t("untimeout.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
          }),
          t("untimeout.target_line", { user: target.tag, id: target.id }),
          t("untimeout.moderator_line", { moderator: interaction.user.tag }),
          t("untimeout.reason_line", { reason }),
        ].join("\n"),
      }),
    );
  },
};
