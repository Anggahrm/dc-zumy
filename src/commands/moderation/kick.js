import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { dmModerationNotice } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("kick", {
  en: {
    title: "Moderation",
    no_reason: "No reason provided.",
    only_in_server: "I can only kick users who are currently in this server.",
    cannot_kick_self: "You cannot kick yourself.",
    cannot_kick_owner: "You cannot kick the server owner.",
    cannot_kick_higher_role: "You cannot kick a member with an equal or higher role than yours.",
    cannot_kick_hierarchy: "I cannot kick that user due to role hierarchy or missing permissions.",
    kick_failed: "Kick failed. Please check role hierarchy and bot permissions.",
    dm_action_label: "Kick",
    complete_title: "**Kick Complete**",
    complete_title_case: "**Kick Complete** — Case #{number}",
    line_target: "- Target: **{tag}** (`{id}`)",
    line_moderator: "- Moderator: **{tag}**",
    line_reason: "- Reason: {reason}",
    dm_failed_note: "- Note: could not DM the member.",
  },
  id: {
    title: "Moderasi",
    no_reason: "Tidak ada alasan yang diberikan.",
    only_in_server: "Aku hanya bisa kick user yang masih ada di server ini.",
    cannot_kick_self: "Kamu tidak bisa kick diri sendiri.",
    cannot_kick_owner: "Kamu tidak bisa kick owner server.",
    cannot_kick_higher_role: "Kamu tidak bisa kick member yang role-nya setara atau lebih tinggi dari punyamu.",
    cannot_kick_hierarchy: "Aku tidak bisa kick user itu karena hierarki role atau permission-ku kurang.",
    kick_failed: "Kick gagal. Cek hierarki role dan permission bot ya.",
    dm_action_label: "Kick",
    complete_title: "**Kick Selesai**",
    complete_title_case: "**Kick Selesai** — Case #{number}",
    line_target: "- Target: **{tag}** (`{id}`)",
    line_moderator: "- Moderator: **{tag}**",
    line_reason: "- Alasan: {reason}",
    dm_failed_note: "- Catatan: tidak bisa mengirim DM ke member itu.",
  },
});

function normalizeReason(reason, t) {
  return reason?.trim() || t("kick.no_reason");
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.KickMembers],
  },
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("User to kick")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for this kick")
        .setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for kick command.");
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"), ctx.t);
    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("kick.title"),
        body: ctx.t("kick.only_in_server"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (target.id === interaction.user.id) {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("kick.title"),
        body: ctx.t("kick.cannot_kick_self"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (target.id === guild.ownerId) {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("kick.title"),
        body: ctx.t("kick.cannot_kick_owner"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (
      interaction.user.id !== guild.ownerId
      && targetMember.roles.highest.position >= actorMember.roles.highest.position
    ) {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("kick.title"),
        body: ctx.t("kick.cannot_kick_higher_role"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (!targetMember.kickable) {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("kick.title"),
        body: ctx.t("kick.cannot_kick_hierarchy"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    // DM before the kick lands — afterwards the bot may share no guild with them.
    const dmDelivered = await dmModerationNotice(target, {
      guildName: guild.name,
      actionLabel: ctx.t("kick.dm_action_label"),
      color: 0xe67e22,
      reason,
    });

    try {
      await targetMember.kick(reason);
    } catch {
      const card = createCard({
        color: 0xed4245,
        title: ctx.t("kick.title"),
        body: ctx.t("kick.kick_failed"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    const caseRow = await recordCase({
      guild,
      type: "kick",
      target,
      moderator: interaction.user,
      reason,
    });

    const card = createCard({
      color: 0xf1c40f,
      title: ctx.t("kick.title"),
      body: [
        caseRow
          ? ctx.t("kick.complete_title_case", { number: caseRow.caseNumber })
          : ctx.t("kick.complete_title"),
        ctx.t("kick.line_target", { tag: target.tag, id: target.id }),
        ctx.t("kick.line_moderator", { tag: interaction.user.tag }),
        ctx.t("kick.line_reason", { reason }),
        ...(dmDelivered ? [] : [ctx.t("kick.dm_failed_note")]),
      ].join("\n"),
    });

    await replyCard(interaction, card, { ephemeral: true });
  },
};
