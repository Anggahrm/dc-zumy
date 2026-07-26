import {
  ChannelType,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SectionBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { registerStrings } from "#services/i18n.js";

registerStrings("serverinfo", {
  en: {
    info_body:
      "## Server Info\n- Name: **{name}**\n- Server ID: `{id}`\n- Owner: {owner}\n- Members: **{members}**\n- Channels: **{text}** text · **{voice}** voice\n- Roles: **{roles}**\n- Emojis: **{emojis}**\n- Boosts: **{boosts}** (tier {tier})\n- Created: <t:{created}:F> (<t:{created}:R>)",
    icon_alt: "{name} icon",
  },
  id: {
    info_body:
      "## Info Server\n- Nama: **{name}**\n- ID Server: `{id}`\n- Owner: {owner}\n- Member: **{members}**\n- Channel: **{text}** text · **{voice}** voice\n- Role: **{roles}**\n- Emoji: **{emojis}**\n- Boost: **{boosts}** (tier {tier})\n- Dibuat: <t:{created}:F> (<t:{created}:R>)",
    icon_alt: "Ikon {name}",
  },
});

export default {
  category: "info",
  cooldown: 3,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show information about this server")
    .setContexts(InteractionContextType.Guild),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for serverinfo command.");
    }

    const owner = await guild.fetchOwner().catch(() => null);
    const channels = guild.channels.cache;
    const textChannels = channels.filter((channel) =>
      channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement).size;
    const voiceChannels = channels.filter((channel) =>
      channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice).size;
    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    const body = ctx.t("serverinfo.info_body", {
      name: guild.name,
      id: guild.id,
      owner: owner ? `**${owner.user.tag}**` : `\`${guild.ownerId}\``,
      members: guild.memberCount,
      text: textChannels,
      voice: voiceChannels,
      roles: guild.roles.cache.size,
      emojis: guild.emojis.cache.size,
      boosts: guild.premiumSubscriptionCount ?? 0,
      tier: guild.premiumTier,
      created: createdAt,
    });

    const iconUrl = guild.iconURL({ extension: "png", size: 1024 });
    const text = new TextDisplayBuilder().setContent(body);
    const card = new ContainerBuilder().setAccentColor(0x5865f2);

    if (iconUrl) {
      card.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text)
          .setThumbnailAccessory((thumbnail) =>
            thumbnail.setURL(iconUrl).setDescription(ctx.t("serverinfo.icon_alt", { name: guild.name })),
          ),
      );
    } else {
      card.addTextDisplayComponents(text);
    }

    await interaction.reply({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
