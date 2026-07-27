import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { getModConfig } from "#services/mod-config.js";
import { unmuteJobKey } from "#services/scheduler-jobs.js";
import { checkActorHierarchy, dmModerationNotice, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

registerStrings("mute", {
  en: {
    title: "Moderation",
    invalid_duration: "That duration isn't recognized — try `30m`, `2h`, or `7d`, or leave it empty to mute until unmuted.",
    no_mute_role: "No mute role set up yet. Run `/muterole create` (or `/muterole set`) first.",
    not_member: "I can only mute people who are in this server.",
    already_muted: "**{user}** is already muted.",
    mute_failed: "The mute didn't go through. Make sure my role is above the mute role and I have Manage Roles.",
    dm_action_label: "Mute",
    dm_duration_line: "- Duration: {duration}",
    duration_indefinite_line: "- Duration: until unmuted",
    case_suffix: " — Case #{caseNumber}",
    applied_title: "**Mute Applied**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    until_line: "- Until: <t:{until}:F> (<t:{until}:R>)",
    reason_line: "- Reason: {reason}",
  },
  id: {
    title: "Moderasi",
    invalid_duration: "Durasi itu tidak dikenali — coba `30m`, `2h`, atau `7d`, atau kosongkan biar mute sampai di-unmute.",
    no_mute_role: "Role mute belum diatur. Jalankan `/muterole create` (atau `/muterole set`) dulu ya.",
    not_member: "Aku cuma bisa mute member server ini.",
    already_muted: "**{user}** sudah di-mute.",
    mute_failed: "Mute-nya tidak berhasil. Pastikan role-ku ada di atas role mute dan aku punya permission Manage Roles.",
    dm_action_label: "Mute",
    dm_duration_line: "- Durasi: {duration}",
    duration_indefinite_line: "- Durasi: sampai di-unmute",
    case_suffix: " — Case #{caseNumber}",
    applied_title: "**Mute Diterapkan**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    until_line: "- Sampai: <t:{until}:F> (<t:{until}:R>)",
    reason_line: "- Alasan: {reason}",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("mute.title"), body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a member with the mute role (no 28-day limit)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to mute").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration, e.g. 2h, 7d, 90d (empty = until unmuted)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for mute command.");
    }

    const t = ctx.t;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const durationRaw = interaction.options.getString("duration");
    const durationMs = durationRaw ? parseDuration(durationRaw) : null;

    if (durationRaw && !durationMs) {
      await replyCard(
        interaction,
        errorCard(t, t("mute.invalid_duration")),
        { ephemeral: true },
      );
      return;
    }

    const { muteRoleId } = await getModConfig(guild.id);
    const muteRole = muteRoleId ? guild.roles.cache.get(muteRoleId) : null;
    if (!muteRole) {
      await replyCard(
        interaction,
        errorCard(t, t("mute.no_mute_role")),
        { ephemeral: true },
      );
      return;
    }

    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard(t, t("mute.not_member")), { ephemeral: true });
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

    if (targetMember.roles.cache.has(muteRole.id)) {
      await replyCard(interaction, errorCard(t, t("mute.already_muted", { user: target.tag })), { ephemeral: true });
      return;
    }

    try {
      await targetMember.roles.add(muteRole, `Muted by ${interaction.user.tag}: ${reason}`);
    } catch {
      await replyCard(
        interaction,
        errorCard(t, t("mute.mute_failed")),
        { ephemeral: true },
      );
      return;
    }

    const scheduler = interaction.client.zumy?.scheduler;
    const durationLabel = durationMs ? formatDuration(durationMs / 1000) : null;
    if (scheduler) {
      if (durationMs) {
        await scheduler.schedule({
          type: "unmute",
          runAt: new Date(Date.now() + durationMs),
          guildId: guild.id,
          payload: { userId: target.id },
          dedupeKey: unmuteJobKey(guild.id, target.id),
        });
      } else {
        // An indefinite mute must clear any stale timed-unmute job.
        await scheduler.cancelByKey(unmuteJobKey(guild.id, target.id)).catch(() => {});
      }
    }

    const caseRow = await recordCase({
      guild,
      type: "mute",
      target,
      moderator: interaction.user,
      reason,
      metadata: durationLabel ? { duration: durationLabel } : {},
    });

    await dmModerationNotice(target, {
      guildName: guild.name,
      actionLabel: t("mute.dm_action_label"),
      reason,
      lines: durationLabel
        ? [t("mute.dm_duration_line", { duration: durationLabel })]
        : [t("mute.duration_indefinite_line")],
    });

    const until = durationMs ? Math.floor((Date.now() + durationMs) / 1000) : null;
    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: t("mute.title"),
        body: [
          t("mute.applied_title", {
            caseSuffix: caseRow ? t("mute.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
          }),
          t("mute.target_line", { user: target.tag, id: target.id }),
          t("mute.moderator_line", { moderator: interaction.user.tag }),
          until ? t("mute.until_line", { until }) : t("mute.duration_indefinite_line"),
          t("mute.reason_line", { reason }),
        ].join("\n"),
      }),
    );
  },
};
