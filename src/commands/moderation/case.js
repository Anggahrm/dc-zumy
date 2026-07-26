import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { CASE_TYPE_META, getCase, listCases, updateCaseReason } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("case", {
  en: {
    title: "Cases",
    not_found: "Case #{number} does not exist.",
    case_title: "Case #{number}",
    line_action: "- Action: **{action}**",
    line_target: "- Target: **{tag}** (`{id}`)",
    line_moderator: "- Moderator: **{tag}**",
    line_moderator_unknown: "- Moderator: Unknown",
    line_when: "- When: <t:{at}:F>",
    line_duration: "- Duration: {duration}",
    line_reason: "- Reason: {reason}",
    no_reason: "No reason provided.",
    no_cases_user: "No cases for **{tag}**.",
    no_cases: "No cases recorded yet.",
    list_line: "**#{number}** {action} — **{tag}** · <t:{at}:R>",
    list_title_user: "Cases for {tag}",
    list_title_recent: "Recent cases",
    reason_updated: "**Case #{number} updated**\n- New reason: {reason}",
  },
  id: {
    title: "Kasus",
    not_found: "Kasus #{number} tidak ada.",
    case_title: "Kasus #{number}",
    line_action: "- Aksi: **{action}**",
    line_target: "- Target: **{tag}** (`{id}`)",
    line_moderator: "- Moderator: **{tag}**",
    line_moderator_unknown: "- Moderator: Tidak diketahui",
    line_when: "- Waktu: <t:{at}:F>",
    line_duration: "- Durasi: {duration}",
    line_reason: "- Alasan: {reason}",
    no_reason: "Tidak ada alasan yang diberikan.",
    no_cases_user: "Tidak ada kasus untuk **{tag}**.",
    no_cases: "Belum ada kasus yang tercatat.",
    list_line: "**#{number}** {action} — **{tag}** · <t:{at}:R>",
    list_title_user: "Kasus untuk {tag}",
    list_title_recent: "Kasus terbaru",
    reason_updated: "**Kasus #{number} diupdate**\n- Alasan baru: {reason}",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("case.title"), body });
}

function formatCaseLines(row, t) {
  const meta = CASE_TYPE_META[row.type] ?? { label: row.type };
  const at = Math.floor(new Date(row.createdAt).getTime() / 1000);
  const lines = [
    t("case.line_action", { action: meta.label }),
    t("case.line_target", { tag: row.targetTag ?? row.targetId, id: row.targetId }),
    row.moderatorTag
      ? t("case.line_moderator", { tag: row.moderatorTag })
      : t("case.line_moderator_unknown"),
    t("case.line_when", { at }),
    t("case.line_reason", { reason: row.reason || t("case.no_reason") }),
  ];
  if (row.metadata?.duration) {
    lines.splice(3, 0, t("case.line_duration", { duration: row.metadata.duration }));
  }
  return lines;
}

export default {
  category: "moderation",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("Look up and edit moderation cases")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View one case")
        .addIntegerOption((option) =>
          option.setName("number").setDescription("Case number").setMinValue(1).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List recent cases")
        .addUserOption((option) =>
          option.setName("target").setDescription("Only cases for this user").setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reason")
        .setDescription("Update the reason of a case")
        .addIntegerOption((option) =>
          option.setName("number").setDescription("Case number").setMinValue(1).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("reason").setDescription("New reason").setMaxLength(400).setRequired(true),
        ),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for case command.");
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      const number = interaction.options.getInteger("number", true);
      const row = await getCase(guild.id, number);
      if (!row) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("case.not_found", { number })), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        createCard({
          color: (CASE_TYPE_META[row.type] ?? {}).color ?? 0x3498db,
          title: ctx.t("case.case_title", { number: row.caseNumber }),
          body: formatCaseLines(row, ctx.t).join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const target = interaction.options.getUser("target");
      const rows = await listCases(guild.id, { targetId: target?.id ?? null, limit: 15 });

      if (rows.length === 0) {
        await replyCard(
          interaction,
          createCard({
            color: 0x57f287,
            title: ctx.t("case.title"),
            body: target ? ctx.t("case.no_cases_user", { tag: target.tag }) : ctx.t("case.no_cases"),
          }),
          { ephemeral: true },
        );
        return;
      }

      const lines = rows.map((row) => {
        const meta = CASE_TYPE_META[row.type] ?? { label: row.type };
        const at = Math.floor(new Date(row.createdAt).getTime() / 1000);
        return ctx.t("case.list_line", {
          number: row.caseNumber,
          action: meta.label,
          tag: row.targetTag ?? row.targetId,
          at,
        });
      });

      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: target ? ctx.t("case.list_title_user", { tag: target.tag }) : ctx.t("case.list_title_recent"),
          body: lines.join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "reason") {
      const number = interaction.options.getInteger("number", true);
      const reason = interaction.options.getString("reason", true).trim();
      const row = await updateCaseReason(guild.id, number, reason);

      if (!row) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("case.not_found", { number })), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: ctx.t("case.title"),
          body: ctx.t("case.reason_updated", { number, reason }),
        }),
        { ephemeral: true },
      );
    }
  },
};
