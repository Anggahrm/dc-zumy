import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { MAX_AFK_REASON_LENGTH, setAfk } from "#services/afk.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "utility",
  cooldown: 5,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Mark yourself AFK — I'll tell people who mention you")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why you're away (optional)")
        .setMaxLength(MAX_AFK_REASON_LENGTH)
        .setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guildId = ctx.guild ?? interaction.guildId;
    const entry = await setAfk(guildId, interaction.user.id, interaction.options.getString("reason"));

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: "AFK",
        body: [
          "You're now AFK. I'll let people know when they mention you.",
          `- Reason: ${entry.reason}`,
          "-# Your AFK clears automatically on your next message.",
        ].join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
