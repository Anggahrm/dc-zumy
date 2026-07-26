import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { listCases, recordCase } from "#services/cases.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "moderation",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Staff-only notes about members (stored as cases)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a note about a member")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("text").setDescription("The note").setMaxLength(400).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List notes about a member")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member").setRequired(true),
        ),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for note command.");
    }

    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser("target", true);

    if (subcommand === "add") {
      const text = interaction.options.getString("text", true).trim();
      const caseRow = await recordCase({
        guild,
        type: "note",
        target,
        moderator: interaction.user,
        reason: text,
      });

      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: "Notes",
          body: [
            `Note saved for **${target.tag}**${caseRow ? ` — Case #${caseRow.caseNumber}` : ""}.`,
            `- ${text}`,
          ].join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const rows = (await listCases(guild.id, { targetId: target.id, limit: 50 }))
        .filter((row) => row.type === "note")
        .slice(0, 15);

      if (rows.length === 0) {
        await replyCard(
          interaction,
          createCard({ color: 0x3498db, title: "Notes", body: `No notes for **${target.tag}**.` }),
          { ephemeral: true },
        );
        return;
      }

      const lines = rows.map((row) => {
        const at = Math.floor(new Date(row.createdAt).getTime() / 1000);
        return `**#${row.caseNumber}** ${row.reason} — by ${row.moderatorTag ?? "unknown"}, <t:${at}:R>`;
      });

      await replyCard(
        interaction,
        createCard({ color: 0x3498db, title: `Notes for ${target.tag}`, body: lines.join("\n") }),
        { ephemeral: true },
      );
    }
  },
};
