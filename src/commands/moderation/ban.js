import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { unbanJobKey } from "#services/scheduler-jobs.js";
import { dmModerationNotice } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("ban", {
  en: {
    title: "Moderation",
    no_reason: "No reason provided.",
    cannot_ban_self: "You cannot ban yourself.",
    cannot_ban_owner: "You cannot ban the server owner.",
    cannot_ban_higher_role: "You cannot ban a member with an equal or higher role than yours.",
    cannot_ban_hierarchy: "I cannot ban that user due to role hierarchy or missing permissions.",
    ban_failed: "Ban failed. Please check role hierarchy and bot permissions.",
    dm_action_label: "Ban",
    complete_title: "**Ban Complete**",
    complete_title_case: "**Ban Complete** — Case #{number}",
    line_target: "- Target: **{tag}** (`{id}`)",
    line_moderator: "- Moderator: **{tag}**",
    line_delete_days: "- Delete messages: **{days}** day(s)",
    line_reason: "- Reason: {reason}",
    dm_failed_note: "- Note: could not DM the member.",
  },
  id: {
    title: "Moderasi",
    no_reason: "Tidak ada alasan yang diberikan.",
    cannot_ban_self: "Kamu tidak bisa ban diri sendiri.",
    cannot_ban_owner: "Kamu tidak bisa ban owner server.",
    cannot_ban_higher_role: "Kamu tidak bisa ban member yang role-nya setara atau lebih tinggi dari punyamu.",
    cannot_ban_hierarchy: "Aku tidak bisa ban user itu karena hierarki role atau permission-ku kurang.",
    ban_failed: "Ban gagal. Cek hierarki role dan permission bot ya.",
    dm_action_label: "Ban",
    complete_title: "**Ban Selesai**",
    complete_title_case: "**Ban Selesai** — Case #{number}",
    line_target: "- Target: **{tag}** (`{id}`)",
    line_moderator: "- Moderator: **{tag}**",
    line_delete_days: "- Hapus pesan: **{days}** hari",
    line_reason: "- Alasan: {reason}",
    dm_failed_note: "- Catatan: tidak bisa mengirim DM ke member itu.",
  },
});

function normalizeReason(reason, t) {
  return reason?.trim() || t("ban.no_reason");
}

function clampDeleteMessageDays(days) {
  if (days == null) return 0;
  return Math.min(Math.max(days, 0), 7);
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.BanMembers],
  },
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("User to ban")
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
      option
        .setName("reason")
        .setDescription("Reason for this ban")
        .setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for ban command.");
    }

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"), ctx.t);
    const days = clampDeleteMessageDays(interaction.options.getInteger("days"));
    const deleteMessageSeconds = days * 24 * 60 * 60;
    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);

    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    if (target.id === interaction.user.id) {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("ban.title"),
        body: ctx.t("ban.cannot_ban_self"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (target.id === guild.ownerId) {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("ban.title"),
        body: ctx.t("ban.cannot_ban_owner"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (
      targetMember
      && interaction.user.id !== guild.ownerId
      && targetMember.roles.highest.position >= actorMember.roles.highest.position
    ) {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("ban.title"),
        body: ctx.t("ban.cannot_ban_higher_role"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (targetMember && !targetMember.bannable) {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("ban.title"),
        body: ctx.t("ban.cannot_ban_hierarchy"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });

    // DM before the ban lands — afterwards the bot may share no guild with them.
    const dmDelivered = targetMember
      ? await dmModerationNotice(target, {
        guildName: guild.name,
        actionLabel: ctx.t("ban.dm_action_label"),
        color: 0xed4245,
        reason,
      })
      : false;

    try {
      await guild.bans.create(target, {
        reason,
        deleteMessageSeconds,
      });
    } catch {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("ban.title"),
        body: ctx.t("ban.ban_failed"),
      });

      await interaction.editReply({
        components: [card],
      });
      return;
    }

    // A permanent ban supersedes any pending tempban auto-unban.
    await interaction.client.zumy?.scheduler?.cancelByKey(unbanJobKey(guild.id, target.id)).catch(() => {});

    const caseRow = await recordCase({
      guild,
      type: "ban",
      target,
      moderator: interaction.user,
      reason,
      metadata: { deleteMessageDays: days },
    });

    const card = createCard({
      color: 0xf1c40f,
      title: ctx.t("ban.title"),
      body: [
        caseRow
          ? ctx.t("ban.complete_title_case", { number: caseRow.caseNumber })
          : ctx.t("ban.complete_title"),
        ctx.t("ban.line_target", { tag: target.tag, id: target.id }),
        ctx.t("ban.line_moderator", { tag: interaction.user.tag }),
        ctx.t("ban.line_delete_days", { days }),
        ctx.t("ban.line_reason", { reason }),
        ...(targetMember && !dmDelivered ? [ctx.t("ban.dm_failed_note")] : []),
      ].join("\n"),
    });

    await interaction.editReply({
      components: [card],
    });
  },
};
