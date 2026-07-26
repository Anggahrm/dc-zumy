import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { getModConfig } from "#services/mod-config.js";
import { unmuteJobKey } from "#services/scheduler-jobs.js";
import { normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("unmute", {
  en: {
    title: "Moderation",
    no_mute_role: "No mute role configured.",
    not_in_server: "That user is not in this server.",
    not_muted: "**{user}** is not muted.",
    unmute_failed: "Unmute failed. Check my role position and permissions.",
    case_suffix: " — Case #{caseNumber}",
    removed_title: "**Mute Removed**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    reason_line: "- Reason: {reason}",
  },
  id: {
    title: "Moderasi",
    no_mute_role: "Role mute belum diatur.",
    not_in_server: "User itu tidak ada di server ini.",
    not_muted: "**{user}** tidak sedang di-mute.",
    unmute_failed: "Unmute gagal. Cek posisi role-ku dan permission bot ya.",
    case_suffix: " — Case #{caseNumber}",
    removed_title: "**Mute Dicabut**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    reason_line: "- Alasan: {reason}",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("unmute.title"), body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove a member's mute role")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to unmute").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for unmute command.");
    }

    const t = ctx.t;
    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));

    const { muteRoleId } = await getModConfig(guild.id);
    if (!muteRoleId) {
      await replyCard(interaction, errorCard(t, t("unmute.no_mute_role")), { ephemeral: true });
      return;
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard(t, t("unmute.not_in_server")), { ephemeral: true });
      return;
    }

    if (!targetMember.roles.cache.has(muteRoleId)) {
      await replyCard(interaction, errorCard(t, t("unmute.not_muted", { user: target.tag })), { ephemeral: true });
      return;
    }

    try {
      await targetMember.roles.remove(muteRoleId, `Unmuted by ${interaction.user.tag}: ${reason}`);
    } catch {
      await replyCard(interaction, errorCard(t, t("unmute.unmute_failed")), { ephemeral: true });
      return;
    }

    await interaction.client.zumy?.scheduler?.cancelByKey(unmuteJobKey(guild.id, target.id)).catch(() => {});

    const caseRow = await recordCase({
      guild,
      type: "unmute",
      target,
      moderator: interaction.user,
      reason,
    });

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: t("unmute.title"),
        body: [
          t("unmute.removed_title", {
            caseSuffix: caseRow ? t("unmute.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
          }),
          t("unmute.target_line", { user: target.tag, id: target.id }),
          t("unmute.moderator_line", { moderator: interaction.user.tag }),
          t("unmute.reason_line", { reason }),
        ].join("\n"),
      }),
    );
  },
};
