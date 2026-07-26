import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import {
  addHighlight,
  clearHighlights,
  getHighlights,
  MAX_HIGHLIGHT_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  removeHighlight,
} from "#services/highlights.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Highlights", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Highlights", body });
}

export default {
  category: "utility",
  cooldown: 3,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("highlight")
    .setDescription("Get a DM when keywords you care about are mentioned")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Watch a keyword")
        .addStringOption((option) =>
          option.setName("keyword").setDescription("Word or phrase (min 2 chars)").setMaxLength(MAX_KEYWORD_LENGTH).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Stop watching a keyword")
        .addStringOption((option) =>
          option.setName("keyword").setDescription("Keyword").setMaxLength(MAX_KEYWORD_LENGTH).setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List your keywords"))
    .addSubcommand((sub) => sub.setName("clear").setDescription("Remove all your keywords")),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const highlights = await getHighlights(interaction.guildId, { preferCache: true });
    const mine = highlights[interaction.user.id] ?? [];
    await interaction.respond(
      mine
        .filter((word) => !query || word.includes(query))
        .slice(0, 25)
        .map((word) => ({ name: word, value: word })),
    );
  },
  async execute({ interaction, ctx }) {
    const guildId = ctx.guild ?? interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const result = await addHighlight(guildId, interaction.user.id, interaction.options.getString("keyword", true));
      if (!result.ok) {
        const reasons = {
          invalid: "Keywords need at least 2 characters.",
          exists: "You're already watching that keyword.",
          full: `You can watch up to ${MAX_HIGHLIGHT_KEYWORDS} keywords.`,
          guild_full: "This server's highlight list is full.",
        };
        await replyCard(interaction, errorCard(reasons[result.reason] ?? "Could not add that keyword."), {
          ephemeral: true,
        });
        return;
      }

      await replyCard(
        interaction,
        successCard([
          `🔔 Watching \`${result.word}\` — I'll DM you when it's mentioned here.`,
          "-# Max one DM per 5 minutes; your own messages and direct mentions don't trigger it.",
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const removed = await removeHighlight(guildId, interaction.user.id, interaction.options.getString("keyword", true));
      await replyCard(
        interaction,
        removed ? successCard("Keyword removed.") : errorCard("You're not watching that keyword."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const highlights = await getHighlights(guildId);
      const mine = highlights[interaction.user.id] ?? [];
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Your highlights",
          body: mine.length > 0
            ? mine.map((word) => `- \`${word}\``).join("\n")
            : "You're not watching any keywords. Use `/highlight add`.",
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "clear") {
      const cleared = await clearHighlights(guildId, interaction.user.id);
      await replyCard(
        interaction,
        cleared ? successCard("All keywords removed.") : errorCard("You had no keywords."),
        { ephemeral: true },
      );
    }
  },
};
