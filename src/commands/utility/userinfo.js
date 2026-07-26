import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { registerStrings } from "#services/i18n.js";

registerStrings("userinfo", {
  en: {
    title: "## User Info",
    line_username: "- Username: **{tag}**",
    line_id: "- User ID: `{id}`",
    line_bot: "- Bot account: **{value}**",
    bot_yes: "yes",
    bot_no: "no",
    line_created: "- Created: <t:{timestamp}:F>",
    avatar_alt: "{tag} avatar",
  },
  id: {
    title: "## Info User",
    line_username: "- Username: **{tag}**",
    line_id: "- User ID: `{id}`",
    line_bot: "- Akun bot: **{value}**",
    bot_yes: "ya",
    bot_no: "bukan",
    line_created: "- Dibuat: <t:{timestamp}:F>",
    avatar_alt: "Avatar {tag}",
  },
});

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
  async execute({ interaction, ctx }) {
    const target = interaction.options.getUser("target") ?? interaction.user;
    const avatarUrl = target.displayAvatarURL({ extension: "png", size: 1024 });

    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            ctx.t("userinfo.title"),
            ctx.t("userinfo.line_username", { tag: target.tag }),
            ctx.t("userinfo.line_id", { id: target.id }),
            ctx.t("userinfo.line_bot", { value: target.bot ? ctx.t("userinfo.bot_yes") : ctx.t("userinfo.bot_no") }),
            ctx.t("userinfo.line_created", { timestamp: Math.floor(target.createdTimestamp / 1000) }),
          ].join("\n"),
        ),
      )
      .setThumbnailAccessory((thumbnail) =>
        thumbnail
          .setURL(avatarUrl)
          .setDescription(ctx.t("userinfo.avatar_alt", { tag: target.tag })),
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
