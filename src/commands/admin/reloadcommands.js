import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "owner",
  cooldown: 3,
  permissions: {
    owner: true,
  },
  data: new SlashCommandBuilder()
    .setName("reloadcommands")
    .setDescription("Reload commands without restart"),
  async execute({ interaction }) {
    const reloadCommands = interaction.client.zumy?.reloadCommands;
    if (!reloadCommands) {
      throw new Error("Reload function is not available");
    }

    await reloadCommands(true);
    const count = interaction.client.zumy?.registry.size() ?? 0;

    const card = createCard({
      color: 0x9b59b6,
      title: "Owner",
      body: [
        "**Reload Complete**",
        `- Active command count: **${count}**`,
        "- Latest command modules are now live.",
      ].join("\n"),
    });

    await replyCard(interaction, card, { ephemeral: true });
  },
};
