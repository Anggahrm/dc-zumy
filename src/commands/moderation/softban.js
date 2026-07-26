import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { checkActorHierarchy, dmModerationNotice, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("softban", {
  en: {
    title: "Moderation",
    only_in_server: "I can only softban members currently in this server.",
    cannot_softban_hierarchy: "I cannot softban that user due to role hierarchy or missing permissions.",
    dm_action_label: "Softban",
    dm_rejoin_line: "- You may rejoin with a new invite.",
    softban_failed: "Softban failed. Please check role hierarchy and bot permissions.",
    case_suffix: " — Case #{caseNumber}",
    complete_title: "**Softban Complete**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    purged_line: "- Messages purged: **{days}** day(s)",
    reason_line: "- Reason: {reason}",
    dm_failed_note: "- Note: could not DM the member.",
  },
  id: {
    title: "Moderasi",
    only_in_server: "Aku hanya bisa softban member yang masih ada di server ini.",
    cannot_softban_hierarchy: "Aku tidak bisa softban user itu karena hierarki role atau permission-ku kurang.",
    dm_action_label: "Softban",
    dm_rejoin_line: "- Kamu bisa join lagi lewat invite baru.",
    softban_failed: "Softban gagal. Cek hierarki role dan permission bot ya.",
    case_suffix: " — Case #{caseNumber}",
    complete_title: "**Softban Selesai**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    moderator_line: "- Moderator: **{moderator}**",
    purged_line: "- Pesan dibersihkan: **{days}** hari",
    reason_line: "- Alasan: {reason}",
    dm_failed_note: "- Catatan: tidak bisa mengirim DM ke member itu.",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("softban.title"), body });
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.BanMembers],
  },
  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Kick a member and purge their recent messages (ban + instant unban)")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to softban").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("days")
        .setDescription("Delete message history (1-7 days, default 1)")
        .setMinValue(1)
        .setMaxValue(7)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for softban command.");
    }

    const t = ctx.t;
    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const days = interaction.options.getInteger("days") ?? 1;

    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard(t, t("softban.only_in_server")), {
        ephemeral: true,
      });
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

    if (!targetMember.bannable) {
      await replyCard(
        interaction,
        errorCard(t, t("softban.cannot_softban_hierarchy")),
        { ephemeral: true },
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const dmDelivered = await dmModerationNotice(target, {
      guildName: guild.name,
      actionLabel: t("softban.dm_action_label"),
      color: 0xe67e22,
      reason,
      lines: [t("softban.dm_rejoin_line")],
    });

    try {
      await guild.bans.create(target, {
        reason: `Softban by ${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: days * 24 * 60 * 60,
      });
      await guild.bans.remove(target.id, `Softban release by ${interaction.user.tag}`);
    } catch {
      await replyCard(interaction, errorCard(t, t("softban.softban_failed")), {
        ephemeral: true,
      });
      return;
    }

    const caseRow = await recordCase({
      guild,
      type: "softban",
      target,
      moderator: interaction.user,
      reason,
      metadata: { deleteMessageDays: days },
    });

    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: t("softban.title"),
        body: [
          t("softban.complete_title", {
            caseSuffix: caseRow ? t("softban.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
          }),
          t("softban.target_line", { user: target.tag, id: target.id }),
          t("softban.moderator_line", { moderator: interaction.user.tag }),
          t("softban.purged_line", { days }),
          t("softban.reason_line", { reason }),
          ...(dmDelivered ? [] : [t("softban.dm_failed_note")]),
        ].join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
