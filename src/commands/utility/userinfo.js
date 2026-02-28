import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";

export default {
  category: "utility",
  cooldown: 3,
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Check user info")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("Pick a user")
        .setRequired(false),
    ),
  async execute({ interaction }) {
    const target = interaction.options.getUser("target") ?? interaction.user;
    const avatarUrl = target.displayAvatarURL({ extension: "png", size: 1024 });

    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "## User Info",
            `- Username: **${target.tag}**`,
            `- User ID: \`${target.id}\``,
            `- Bot account: **${target.bot ? "yes" : "no"}**`,
            `- Created: <t:${Math.floor(target.createdTimestamp / 1000)}:F>`,
          ].join("\n"),
        ),
      )
      .setThumbnailAccessory((thumbnail) =>
        thumbnail
          .setURL(avatarUrl)
          .setDescription(`${target.tag} avatar`),
      );

    const card = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addSectionComponents(section);

    await interaction.reply({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
