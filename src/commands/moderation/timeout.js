import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { checkActorHierarchy, dmModerationNotice, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

registerStrings("timeout", {
  en: {
    title: "Moderation",
    invalid_duration: "Invalid duration. Use formats like `30s`, `10m`, `2h`, `1d` or a bare number of minutes.",
    max_duration: "Timeout duration cannot exceed **28 days**.",
    not_member: "I can only time out members of this server.",
    cannot_timeout_hierarchy: "I cannot time out that user due to role hierarchy or missing permissions.",
    timeout_failed: "Timeout failed. Please check role hierarchy and bot permissions.",
    dm_action_label: "Timeout",
    dm_duration_line: "- Duration: {duration}",
    case_suffix: " — Case #{caseNumber}",
    applied_title: "**Timeout Applied**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    until_line: "- Until: <t:{until}:F> (<t:{until}:R>)",
    reason_line: "- Reason: {reason}",
  },
  id: {
    title: "Moderasi",
    invalid_duration: "Durasi tidak valid. Pakai format seperti `30s`, `10m`, `2h`, `1d`, atau angka saja untuk menit.",
    max_duration: "Durasi timeout tidak bisa lebih dari **28 hari**.",
    not_member: "Aku cuma bisa timeout member server ini.",
    cannot_timeout_hierarchy: "Aku tidak bisa timeout user itu karena hierarki role atau permission-ku kurang.",
    timeout_failed: "Timeout gagal. Cek hierarki role dan permission bot ya.",
    dm_action_label: "Timeout",
    dm_duration_line: "- Durasi: {duration}",
    case_suffix: " — Case #{caseNumber}",
    applied_title: "**Timeout Diterapkan**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    until_line: "- Sampai: <t:{until}:F> (<t:{until}:R>)",
    reason_line: "- Alasan: {reason}",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("timeout.title"), body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Time out a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to time out").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration, e.g. 10m, 2h, 1d (bare number = minutes, max 28d)")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for the timeout").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for timeout command.");
    }

    const t = ctx.t;
    const target = interaction.options.getUser("target", true);
    const durationMs = parseDuration(interaction.options.getString("duration", true));
    const reason = normalizeReason(interaction.options.getString("reason"));

    if (!durationMs) {
      await replyCard(
        interaction,
        errorCard(t, t("timeout.invalid_duration")),
        { ephemeral: true },
      );
      return;
    }

    if (durationMs > MAX_TIMEOUT_MS) {
      await replyCard(interaction, errorCard(t, t("timeout.max_duration")), { ephemeral: true });
      return;
    }

    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard(t, t("timeout.not_member")), { ephemeral: true });
      return;
    }

    const rejection = checkActorHierarchy({
      guild,
      actorUserId: interaction.user.id,
      actorMember,
      targetUserId: target.id,
      targetMember,
    });
    if (rejection) {
      await replyCard(interaction, errorCard(t, rejection), { ephemeral: true });
      return;
    }

    if (!targetMember.moderatable) {
      await replyCard(
        interaction,
        errorCard(t, t("timeout.cannot_timeout_hierarchy")),
        { ephemeral: true },
      );
      return;
    }

    try {
      await targetMember.timeout(durationMs, reason);
    } catch {
      await replyCard(
        interaction,
        errorCard(t, t("timeout.timeout_failed")),
        { ephemeral: true },
      );
      return;
    }

    const durationLabel = formatDuration(durationMs / 1000);
    const caseRow = await recordCase({
      guild,
      type: "timeout",
      target,
      moderator: interaction.user,
      reason,
      metadata: { duration: durationLabel },
    });

    await dmModerationNotice(target, {
      guildName: guild.name,
      actionLabel: t("timeout.dm_action_label"),
      reason,
      lines: [t("timeout.dm_duration_line", { duration: durationLabel })],
    });

    const until = Math.floor((Date.now() + durationMs) / 1000);
    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: t("timeout.title"),
        body: [
          t("timeout.applied_title", {
            caseSuffix: caseRow ? t("timeout.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
          }),
          t("timeout.target_line", { user: target.tag, id: target.id }),
          t("timeout.moderator_line", { moderator: interaction.user.tag }),
          t("timeout.until_line", { until }),
          t("timeout.reason_line", { reason }),
        ].join("\n"),
      }),
    );
  },
};
