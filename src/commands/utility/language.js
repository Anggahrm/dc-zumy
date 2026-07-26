import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getGuildLanguage, setGuildLanguage } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

const LANGUAGE_NAMES = { en: "English", id: "Bahasa Indonesia" };

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
          title: "Language",
          body: `Current language: **${LANGUAGE_NAMES[current]}** (\`${current}\`)`,
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
        title: "Language",
        body: language === "id"
          ? "Bahasa bot diganti ke **Bahasa Indonesia** 🇮🇩\n-# Pesan sistem (error, cooldown, sambutan default, level-up, AFK, ulang tahun) sekarang berbahasa Indonesia. Terjemahan command lain menyusul bertahap."
          : "Bot language set to **English** 🇬🇧",
      }),
      { ephemeral: true },
    );
  },
};
