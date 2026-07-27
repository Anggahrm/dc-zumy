import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import {
  addHighlight,
  clearHighlights,
  getHighlights,
  MAX_HIGHLIGHT_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  removeHighlight,
} from "#services/highlights.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("highlight", {
  en: {
    title: "Highlights",
    reason_invalid: "Keywords need at least 2 characters.",
    reason_exists: "That keyword is already on your list.",
    reason_full: "You can keep up to {max} keywords.",
    reason_guild_full: "This server's highlight list is full.",
    add_failed: "Couldn't add that keyword.",
    watching: "Got it — I'll DM you when `{word}` is mentioned here.\n-# Max one DM per 5 minutes; your own messages and direct mentions don't count.",
    removed: "Keyword removed.",
    not_watching: "That keyword isn't on your list.",
    your_title: "Your highlights",
    list_empty: "No keywords yet. Add one with `/highlight add`.",
    cleared: "All keywords removed.",
    none_to_clear: "You had no keywords.",
  },
  id: {
    title: "Highlight",
    reason_invalid: "Keyword minimal 2 karakter.",
    reason_exists: "Keyword itu sudah ada di daftarmu.",
    reason_full: "Kamu bisa menyimpan maksimal {max} keyword.",
    reason_guild_full: "Daftar highlight server ini sudah penuh.",
    add_failed: "Tidak bisa menambahkan keyword itu.",
    watching: "Oke — aku akan DM kamu kalau `{word}` disebut di sini.\n-# Maksimal satu DM per 5 menit; pesanmu sendiri dan mention langsung tidak dihitung.",
    removed: "Keyword dihapus.",
    not_watching: "Keyword itu tidak ada di daftarmu.",
    your_title: "Highlight kamu",
    list_empty: "Belum ada keyword. Tambahkan dengan `/highlight add`.",
    cleared: "Semua keyword dihapus.",
    none_to_clear: "Kamu tidak punya keyword.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("highlight.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("highlight.title"), body });
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
        .setDescription("Add a keyword to your list")
        .addStringOption((option) =>
          option.setName("keyword").setDescription("Word or phrase (min 2 chars)").setMaxLength(MAX_KEYWORD_LENGTH).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a keyword from your list")
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
          invalid: ctx.t("highlight.reason_invalid"),
          exists: ctx.t("highlight.reason_exists"),
          full: ctx.t("highlight.reason_full", { max: MAX_HIGHLIGHT_KEYWORDS }),
          guild_full: ctx.t("highlight.reason_guild_full"),
        };
        await replyCard(interaction, errorCard(ctx.t, reasons[result.reason] ?? ctx.t("highlight.add_failed")), {
          ephemeral: true,
        });
        return;
      }

      await replyCard(
        interaction,
        successCard(ctx.t, ctx.t("highlight.watching", { word: result.word })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const removed = await removeHighlight(guildId, interaction.user.id, interaction.options.getString("keyword", true));
      await replyCard(
        interaction,
        removed ? successCard(ctx.t, ctx.t("highlight.removed")) : errorCard(ctx.t, ctx.t("highlight.not_watching")),
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
          title: ctx.t("highlight.your_title"),
          body: mine.length > 0
            ? mine.map((word) => `- \`${word}\``).join("\n")
            : ctx.t("highlight.list_empty"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "clear") {
      const cleared = await clearHighlights(guildId, interaction.user.id);
      await replyCard(
        interaction,
        cleared ? successCard(ctx.t, ctx.t("highlight.cleared")) : errorCard(ctx.t, ctx.t("highlight.none_to_clear")),
        { ephemeral: true },
      );
    }
  },
};
