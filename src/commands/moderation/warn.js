import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { applyWarnEscalation } from "#services/escalation.js";
import { registerStrings } from "#services/i18n.js";
import { addWarning, clearWarnings, getWarnings, removeWarning } from "#services/warnings.js";
import { checkActorHierarchy, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("warn", {
  en: {
    title: "Moderation",
    dm_title: "Warning",
    cannot_warn_bot: "You cannot warn a bot.",
    dm_intro: "You received a warning in **{guild}**.",
    reason_line: "- Reason: {reason}",
    total_line: "- Total warnings: **{count}**",
    case_suffix: " — Case #{caseNumber}",
    issued_title: "**Warning Issued**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    warning_id_line: "- Warning ID: `{id}`",
    escalation_line: "- ⚖️ Escalation triggered: **{action}**",
    dm_failed_note: "- Note: could not DM the member.",
    no_warnings: "**{user}** has no warnings.",
    list_header: "**Warnings for {user}** ({count} total{suffix})",
    list_truncated_suffix: ", showing latest 15",
    entry_line: "**{index}.** `{id}` — {reason}",
    entry_meta: "-# by <@{moderator}> · <t:{at}:R>",
    removed: "Warning `{id}` removed from **{user}**.",
    remove_not_found: "No warning with that id found for **{user}**.",
    cleared: "Cleared **{count}** warning(s) for **{user}**.",
    clear_none: "**{user}** has no warnings to clear.",
  },
  id: {
    title: "Moderasi",
    dm_title: "Peringatan",
    cannot_warn_bot: "Kamu tidak bisa warn bot.",
    dm_intro: "Kamu menerima peringatan di **{guild}**.",
    reason_line: "- Alasan: {reason}",
    total_line: "- Total peringatan: **{count}**",
    case_suffix: " — Case #{caseNumber}",
    issued_title: "**Peringatan Diberikan**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    warning_id_line: "- ID Peringatan: `{id}`",
    escalation_line: "- ⚖️ Eskalasi terpicu: **{action}**",
    dm_failed_note: "- Catatan: tidak bisa mengirim DM ke member itu.",
    no_warnings: "**{user}** tidak punya peringatan.",
    list_header: "**Peringatan untuk {user}** ({count} total{suffix})",
    list_truncated_suffix: ", menampilkan 15 terbaru",
    entry_line: "**{index}.** `{id}` — {reason}",
    entry_meta: "-# oleh <@{moderator}> · <t:{at}:R>",
    removed: "Peringatan `{id}` dihapus dari **{user}**.",
    remove_not_found: "Tidak ada peringatan dengan id itu untuk **{user}**.",
    cleared: "Berhasil menghapus **{count}** peringatan untuk **{user}**.",
    clear_none: "**{user}** tidak punya peringatan untuk dihapus.",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("warn.title"), body });
}

function successCard(t, body) {
  return createCard({ color: 0xf1c40f, title: t("warn.title"), body });
}

function formatWarningLine(t, entry, index) {
  return [
    t("warn.entry_line", { index: index + 1, id: entry.id, reason: entry.reason }),
    t("warn.entry_meta", { moderator: entry.moderatorId, at: Math.floor(entry.at / 1000) }),
  ].join("\n");
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Manage member warnings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Warn a member")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member to warn").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("reason").setDescription("Reason for the warning").setMaxLength(400).setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List a member's warnings")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member to inspect").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove one warning by id")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member whose warning to remove").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("id").setDescription("Warning id (from /warn list)").setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear all warnings for a member")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member whose warnings to clear").setRequired(true),
        ),
    ),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const targetId = interaction.options.get("target")?.value;
    if (typeof targetId !== "string") {
      await interaction.respond([]);
      return;
    }

    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const warnings = await getWarnings(interaction.guildId, targetId);
    const matches = warnings
      .filter((entry) => !query || entry.id.includes(query) || entry.reason.toLowerCase().includes(query))
      .slice(-25)
      .map((entry) => ({
        name: `${entry.id} — ${entry.reason}`.slice(0, 100),
        value: entry.id,
      }));
    await interaction.respond(matches);
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for warn command.");
    }

    const t = ctx.t;
    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser("target", true);

    if (subcommand === "add") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!actorMember) {
        throw new Error("Failed to resolve invoking member.");
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

      if (target.bot) {
        await replyCard(interaction, errorCard(t, t("warn.cannot_warn_bot")), { ephemeral: true });
        return;
      }

      const reason = normalizeReason(interaction.options.getString("reason"));
      const { entry, count } = await addWarning(guildId, target.id, {
        moderatorId: interaction.user.id,
        reason,
      });

      const caseRow = await recordCase({
        guild,
        type: "warn",
        target,
        moderator: interaction.user,
        reason,
        metadata: { warningId: entry.id, totalWarnings: count },
      });

      let dmDelivered = true;
      try {
        await target.send({
          components: [
            createCard({
              color: 0xf1c40f,
              title: t("warn.dm_title"),
              body: [
                t("warn.dm_intro", { guild: guild.name }),
                t("warn.reason_line", { reason }),
                t("warn.total_line", { count }),
              ].join("\n"),
            }),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {
        dmDelivered = false;
      }

      const escalated = await applyWarnEscalation({
        guild,
        user: target,
        warningCount: count,
        logger: interaction.client.zumy?.logger,
      });

      await replyCard(
        interaction,
        successCard(t, [
          t("warn.issued_title", {
            caseSuffix: caseRow ? t("warn.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
          }),
          t("warn.target_line", { user: target.tag, id: target.id }),
          t("warn.reason_line", { reason }),
          t("warn.warning_id_line", { id: entry.id }),
          t("warn.total_line", { count }),
          ...(escalated ? [t("warn.escalation_line", { action: escalated })] : []),
          ...(dmDelivered ? [] : [t("warn.dm_failed_note")]),
        ].join("\n")),
      );
      return;
    }

    if (subcommand === "list") {
      const warnings = await getWarnings(guildId, target.id);
      if (warnings.length === 0) {
        await replyCard(
          interaction,
          createCard({
            color: 0x57f287,
            title: t("warn.title"),
            body: t("warn.no_warnings", { user: target.tag }),
          }),
          { ephemeral: true },
        );
        return;
      }

      const lines = warnings.slice(-15).map((entry, index) => formatWarningLine(t, entry, index));
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: t("warn.title"),
          body: [
            t("warn.list_header", {
              user: target.tag,
              count: warnings.length,
              suffix: warnings.length > 15 ? t("warn.list_truncated_suffix") : "",
            }),
            "",
            ...lines,
          ].join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const warnId = interaction.options.getString("id", true).trim();
      const removed = await removeWarning(guildId, target.id, warnId);
      await replyCard(
        interaction,
        removed
          ? successCard(t, t("warn.removed", { id: warnId.replaceAll("`", "'"), user: target.tag }))
          : errorCard(t, t("warn.remove_not_found", { user: target.tag })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "clear") {
      const cleared = await clearWarnings(guildId, target.id);
      await replyCard(
        interaction,
        cleared > 0
          ? successCard(t, t("warn.cleared", { count: cleared, user: target.tag }))
          : errorCard(t, t("warn.clear_none", { user: target.tag })),
        { ephemeral: true },
      );
    }
  },
};
