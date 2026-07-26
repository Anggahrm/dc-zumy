import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "owner",
  cooldown: 2,
  permissions: {
    owner: true,
  },
  data: new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("Toggle maintenance mode (owner only)")
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Enable or disable maintenance mode (omit to check status)")
        .setRequired(false),
    ),
  async execute({ interaction }) {
    await global.db.loadBot();
    const enabled = interaction.options.getBoolean("enabled");

    if (enabled === null) {
      const active = Boolean(global.db.bot.maintenance);
      await replyCard(
        interaction,
        createCard({
          color: active ? 0xf1c40f : 0x57f287,
          title: "Maintenance",
          body: active
            ? "Maintenance mode is **enabled**. Only owners can use commands."
            : "Maintenance mode is **disabled**. The bot is public.",
        }),
        { ephemeral: true },
      );
      return;
    }

    global.db.bot.maintenance = enabled;

    await replyCard(
      interaction,
      createCard({
        color: enabled ? 0xf1c40f : 0x57f287,
        title: "Maintenance",
        body: enabled
          ? "Maintenance mode **enabled**. Non-owner commands are now blocked."
          : "Maintenance mode **disabled**. The bot is public again.",
      }),
      { ephemeral: true },
    );
  },
};
