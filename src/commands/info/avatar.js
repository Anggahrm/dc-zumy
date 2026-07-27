import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { registerStrings } from "#services/i18n.js";

registerStrings("avatar", {
  en: {
    card_title: "## Avatar\n**{tag}** (`{id}`)",
    image_alt: "{tag} avatar",
  },
  id: {
    card_title: "## Avatar\n**{tag}** (`{id}`)",
    image_alt: "Avatar {tag}",
  },
});

export default {
  category: "info",
  cooldown: 3,
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar")
    .addUserOption((option) =>
      option.setName("target").setDescription("Whose avatar to show").setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const target = interaction.options.getUser("target") ?? interaction.user;
    const avatarUrl = target.displayAvatarURL({ extension: "png", size: 1024 });

    const card = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(ctx.t("avatar.card_title", { tag: target.tag, id: target.id })),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(avatarUrl)
            .setDescription(ctx.t("avatar.image_alt", { tag: target.tag })),
        ),
      );

    await interaction.reply({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
