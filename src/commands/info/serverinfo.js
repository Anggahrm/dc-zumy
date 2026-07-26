import {
  ChannelType,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SectionBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";

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
  async execute({ interaction }) {
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

    const lines = [
      "## Server Info",
      `- Name: **${guild.name}**`,
      `- Server ID: \`${guild.id}\``,
      `- Owner: ${owner ? `**${owner.user.tag}**` : `\`${guild.ownerId}\``}`,
      `- Members: **${guild.memberCount}**`,
      `- Channels: **${textChannels}** text · **${voiceChannels}** voice`,
      `- Roles: **${guild.roles.cache.size}**`,
      `- Emojis: **${guild.emojis.cache.size}**`,
      `- Boosts: **${guild.premiumSubscriptionCount ?? 0}** (tier ${guild.premiumTier})`,
      `- Created: <t:${createdAt}:F> (<t:${createdAt}:R>)`,
    ];

    const iconUrl = guild.iconURL({ extension: "png", size: 1024 });
    const text = new TextDisplayBuilder().setContent(lines.join("\n"));
    const card = new ContainerBuilder().setAccentColor(0x5865f2);

    if (iconUrl) {
      card.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text)
          .setThumbnailAccessory((thumbnail) =>
            thumbnail.setURL(iconUrl).setDescription(`${guild.name} icon`),
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
