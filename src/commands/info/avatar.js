import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";

export default {
  category: "info",
  cooldown: 3,
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar")
    .addUserOption((option) =>
      option.setName("target").setDescription("User to inspect").setRequired(false),
    ),
  async execute({ interaction }) {
    const target = interaction.options.getUser("target") ?? interaction.user;
    const avatarUrl = target.displayAvatarURL({ extension: "png", size: 1024 });

    const card = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Avatar\n**${target.tag}** (\`${target.id}\`)`),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(avatarUrl)
            .setDescription(`${target.tag} avatar`),
        ),
      );

    await interaction.reply({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
