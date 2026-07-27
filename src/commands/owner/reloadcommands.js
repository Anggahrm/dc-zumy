import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("reloadcommands", {
  en: {
    title: "Owner",
    complete_body:
      "**Reload complete**\n- **{count}** commands active\n- The latest command code is live.\n- Slash commands re-deployed to Discord.",
  },
  id: {
    title: "Owner",
    complete_body:
      "**Reload selesai**\n- **{count}** command aktif\n- Kode command terbaru sudah live.\n- Slash command sudah di-deploy ulang ke Discord.",
  },
});

export default {
  category: "owner",
  cooldown: 3,
  permissions: {
    owner: true,
  },
  data: new SlashCommandBuilder()
    .setName("reloadcommands")
    .setDescription("Reload commands without restart"),
  async execute({ interaction, ctx }) {
    const reloadCommands = interaction.client.zumy?.reloadCommands;
    if (!reloadCommands) {
      throw new Error("Reload function is not available");
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await reloadCommands(true, { deploy: true });
    const count = interaction.client.zumy?.registry.size() ?? 0;

    const card = createCard({
      color: 0x9b59b6,
      title: ctx.t("reloadcommands.title"),
      body: ctx.t("reloadcommands.complete_body", { count }),
    });

    await replyCard(interaction, card, { ephemeral: true });
  },
};
