import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    admin: true,
  },
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear recent messages")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("How many messages (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("Only delete messages from this user")
        .setRequired(false),
    ),
  async execute({ interaction }) {
    const amount = interaction.options.getInteger("amount", true);
    const target = interaction.options.getUser("target");

    if (!interaction.channel || typeof interaction.channel.bulkDelete !== "function") {
      throw new Error("Can't bulk delete in this channel.");
    }

    let deleted;

    if (!target) {
      deleted = await interaction.channel.bulkDelete(amount, true);
    } else {
      const fetched = await interaction.channel.messages.fetch({ limit: 100 });
      const filtered = fetched
        .filter((message) => message.author?.id === target.id)
        .first(amount);

      if (filtered.length === 0) {
        const emptyCard = createCard({
          color: 0xf1c40f,
          title: "Moderation",
          body: `No recent messages found from **${target.tag}** in the latest 100 messages.`,
        });

        await replyCard(interaction, emptyCard, { ephemeral: true });
        return;
      }

      deleted = await interaction.channel.bulkDelete(filtered, true);
    }

    const card = createCard({
      color: 0xf1c40f,
      title: "Moderation",
      body: [
        "**Cleanup Complete**",
        `- Requested: **${amount}** message(s)${target ? ` from **${target.tag}**` : ""}`,
        `- Deleted: **${deleted.size}** message(s)`,
      ].join("\n"),
    });

    await replyCard(interaction, card, { ephemeral: true });
  },
};
