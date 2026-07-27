import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { unbanJobKey } from "#services/scheduler-jobs.js";
import { checkActorHierarchy, dmModerationNotice, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

registerStrings("tempban", {
  en: {
    title: "Moderation",
    invalid_duration: "That duration isn't recognized — try `12h`, `1d`, `7d`, or `4w`.",
    cannot_tempban_self_or_owner: "You can't tempban yourself or the server owner.",
    cannot_ban_hierarchy: "I can't ban them — their role is above mine, or I'm missing permissions.",
    dm_action_label: "Temporary ban",
    dm_duration_line: "- Duration: {duration}",
    dm_ends_line: "- Ends: <t:{until}:F>",
    ban_failed: "The ban didn't go through. Check that my role is above theirs and that I can ban members.",
    case_suffix: " — Case #{caseNumber}",
    applied_title: "**Tempban Applied**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    duration_line: "- Duration: **{duration}** (unban <t:{until}:R>)",
    delete_days_line: "- Delete messages: **{days}** day(s)",
    reason_line: "- Reason: {reason}",
  },
  id: {
    title: "Moderasi",
    invalid_duration: "Durasi itu tidak dikenali — coba `12h`, `1d`, `7d`, atau `4w`.",
    cannot_tempban_self_or_owner: "Kamu tidak bisa tempban diri sendiri atau owner server.",
    cannot_ban_hierarchy: "Aku tidak bisa ban member itu — role mereka di atas role-ku, atau permission-ku kurang.",
    dm_action_label: "Ban sementara",
    dm_duration_line: "- Durasi: {duration}",
    dm_ends_line: "- Berakhir: <t:{until}:F>",
    ban_failed: "Ban-nya tidak berhasil. Pastikan role-ku di atas role member itu dan aku punya izin ban ya.",
    case_suffix: " — Case #{caseNumber}",
    applied_title: "**Tempban Diterapkan**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    duration_line: "- Durasi: **{duration}** (unban <t:{until}:R>)",
    delete_days_line: "- Hapus pesan: **{days}** hari",
    reason_line: "- Alasan: {reason}",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("tempban.title"), body });
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.BanMembers],
  },
  data: new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Ban a user temporarily (auto-unban when it expires)")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("User to ban").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Ban duration, e.g. 1d, 7d, 4w")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("days")
        .setDescription("Delete message history (0-7 days)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for tempban command.");
    }

    const scheduler = interaction.client.zumy?.scheduler;
    if (!scheduler) {
      throw new Error("Scheduler is not available.");
    }

    const t = ctx.t;
    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const durationMs = parseDuration(interaction.options.getString("duration", true));
    const days = Math.min(Math.max(interaction.options.getInteger("days") ?? 0, 0), 7);

    if (!durationMs) {
      await replyCard(
        interaction,
        errorCard(t, t("tempban.invalid_duration")),
        { ephemeral: true },
      );
      return;
    }

    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    if (target.id === interaction.user.id || target.id === guild.ownerId) {
      await replyCard(interaction, errorCard(t, t("tempban.cannot_tempban_self_or_owner")), { ephemeral: true });
      return;
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
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

    if (targetMember && !targetMember.bannable) {
      await replyCard(
        interaction,
        errorCard(t, t("tempban.cannot_ban_hierarchy")),
        { ephemeral: true },
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const durationLabel = formatDuration(durationMs / 1000);
    const until = Math.floor((Date.now() + durationMs) / 1000);

    if (targetMember) {
      await dmModerationNotice(target, {
        guildName: guild.name,
        actionLabel: t("tempban.dm_action_label"),
        color: 0xed4245,
        reason,
        lines: [t("tempban.dm_duration_line", { duration: durationLabel }), t("tempban.dm_ends_line", { until })],
      });
    }

    try {
      await guild.bans.create(target, {
        reason: `Tempban (${durationLabel}) by ${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: days * 24 * 60 * 60,
      });
    } catch {
      await replyCard(interaction, errorCard(t, t("tempban.ban_failed")), {
        ephemeral: true,
      });
      return;
    }

    const caseRow = await recordCase({
      guild,
      type: "tempban",
      target,
      moderator: interaction.user,
      reason,
      metadata: { duration: durationLabel },
    });

    await scheduler.schedule({
      type: "unban",
      runAt: new Date(Date.now() + durationMs),
      guildId: guild.id,
      payload: { userId: target.id, caseNumber: caseRow?.caseNumber ?? null },
      dedupeKey: unbanJobKey(guild.id, target.id),
    });

    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: t("tempban.title"),
        body: [
          t("tempban.applied_title", {
            caseSuffix: caseRow ? t("tempban.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
          }),
          t("tempban.target_line", { user: target.tag, id: target.id }),
          t("tempban.moderator_line", { moderator: interaction.user.tag }),
          t("tempban.duration_line", { duration: durationLabel, until }),
          t("tempban.delete_days_line", { days }),
          t("tempban.reason_line", { reason }),
        ].join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
