import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getGuildLanguage, registerStrings, setGuildLanguage } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

const LANGUAGE_NAMES = { en: "English", id: "Bahasa Indonesia" };

// The set-confirmation messages intentionally follow the *chosen* language
// (ctx.t is still bound to the previous guild language when they render), so
// both dictionaries carry the same values for `set_en` / `set_id`.
const SET_TO_EN = "Bot language set to **English** 🇬🇧";
const SET_TO_ID = "Bahasa bot diganti ke **Bahasa Indonesia** 🇮🇩\n-# Pesan sistem (error, cooldown, sambutan default, level-up, AFK, ulang tahun) sekarang berbahasa Indonesia. Terjemahan command lain menyusul bertahap.";

registerStrings("language", {
  en: {
    title: "Language",
    current_language: "Current language: **{name}** (`{code}`)",
    set_en: SET_TO_EN,
    set_id: SET_TO_ID,
  },
  id: {
    title: "Bahasa",
    current_language: "Bahasa saat ini: **{name}** (`{code}`)",
    set_en: SET_TO_EN,
    set_id: SET_TO_ID,
  },
});

export default {
  category: "utility",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("language")
    .setDescription("Set the bot language for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("language")
        .setDescription("Language (empty shows the current one)")
        .addChoices(
          { name: "English", value: "en" },
          { name: "Bahasa Indonesia", value: "id" },
        )
        .setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guildId = ctx.guild ?? interaction.guildId;
    const language = interaction.options.getString("language");

    if (!language) {
      const current = await getGuildLanguage(guildId, {});
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: ctx.t("language.title"),
          body: ctx.t("language.current_language", { name: LANGUAGE_NAMES[current], code: current }),
        }),
        { ephemeral: true },
      );
      return;
    }

    await setGuildLanguage(guildId, language);
    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: ctx.t("language.title"),
        body: language === "id" ? ctx.t("language.set_id") : ctx.t("language.set_en"),
      }),
      { ephemeral: true },
    );
  },
};
