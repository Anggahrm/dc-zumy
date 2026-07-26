import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { listCases, recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("note", {
  en: {
    title: "Notes",
    case_suffix: " — Case #{caseNumber}",
    saved: "Note saved for **{user}**{caseSuffix}.",
    none: "No notes for **{user}**.",
    list_title: "Notes for {user}",
    list_line: "**#{caseNumber}** {reason} — by {moderator}, <t:{at}:R>",
    unknown_moderator: "unknown",
  },
  id: {
    title: "Catatan",
    case_suffix: " — Case #{caseNumber}",
    saved: "Catatan untuk **{user}** tersimpan{caseSuffix}.",
    none: "Belum ada catatan untuk **{user}**.",
    list_title: "Catatan untuk {user}",
    list_line: "**#{caseNumber}** {reason} — oleh {moderator}, <t:{at}:R>",
    unknown_moderator: "tidak diketahui",
  },
});

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
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for note command.");
    }

    const t = ctx.t;
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
          title: t("note.title"),
          body: [
            t("note.saved", {
              caseSuffix: caseRow ? t("note.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
              user: target.tag,
            }),
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
          createCard({ color: 0x3498db, title: t("note.title"), body: t("note.none", { user: target.tag }) }),
          { ephemeral: true },
        );
        return;
      }

      const lines = rows.map((row) => {
        const at = Math.floor(new Date(row.createdAt).getTime() / 1000);
        return t("note.list_line", {
          caseNumber: row.caseNumber,
          at,
          moderator: row.moderatorTag ?? t("note.unknown_moderator"),
          reason: row.reason,
        });
      });

      await replyCard(
        interaction,
        createCard({ color: 0x3498db, title: t("note.list_title", { user: target.tag }), body: lines.join("\n") }),
        { ephemeral: true },
      );
    }
  },
};
