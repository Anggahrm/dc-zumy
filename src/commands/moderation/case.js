import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { CASE_TYPE_META, getCase, listCases, updateCaseReason } from "#services/cases.js";
import { createCard, replyCard } from "#utils/respond.js";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Cases", body });
}

function formatCaseLines(row) {
  const meta = CASE_TYPE_META[row.type] ?? { label: row.type };
  const at = Math.floor(new Date(row.createdAt).getTime() / 1000);
  const lines = [
    `- Action: **${meta.label}**`,
    `- Target: **${row.targetTag ?? row.targetId}** (\`${row.targetId}\`)`,
    `- Moderator: ${row.moderatorTag ? `**${row.moderatorTag}**` : "Unknown"}`,
    `- When: <t:${at}:F>`,
    `- Reason: ${row.reason || "No reason provided."}`,
  ];
  if (row.metadata?.duration) {
    lines.splice(3, 0, `- Duration: ${row.metadata.duration}`);
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
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for case command.");
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      const number = interaction.options.getInteger("number", true);
      const row = await getCase(guild.id, number);
      if (!row) {
        await replyCard(interaction, errorCard(`Case #${number} does not exist.`), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        createCard({
          color: (CASE_TYPE_META[row.type] ?? {}).color ?? 0x3498db,
          title: `Case #${row.caseNumber}`,
          body: formatCaseLines(row).join("\n"),
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
            title: "Cases",
            body: target ? `No cases for **${target.tag}**.` : "No cases recorded yet.",
          }),
          { ephemeral: true },
        );
        return;
      }

      const lines = rows.map((row) => {
        const meta = CASE_TYPE_META[row.type] ?? { label: row.type };
        const at = Math.floor(new Date(row.createdAt).getTime() / 1000);
        return `**#${row.caseNumber}** ${meta.label} — **${row.targetTag ?? row.targetId}** · <t:${at}:R>`;
      });

      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: target ? `Cases for ${target.tag}` : "Recent cases",
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
        await replyCard(interaction, errorCard(`Case #${number} does not exist.`), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: "Cases",
          body: [`**Case #${number} updated**`, `- New reason: ${reason}`].join("\n"),
        }),
        { ephemeral: true },
      );
    }
  },
};
