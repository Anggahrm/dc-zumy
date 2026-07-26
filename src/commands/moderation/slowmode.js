import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

const MAX_SLOWMODE_SECONDS = 21600;

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageChannels],
  },
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode (0 to disable)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((option) =>
      option
        .setName("seconds")
        .setDescription("Seconds between messages (0-21600)")
        .setMinValue(0)
        .setMaxValue(MAX_SLOWMODE_SECONDS)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Target channel (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for slowmode command.");
    }

    const seconds = interaction.options.getInteger("seconds", true);
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;

    if (!channel || typeof channel.setRateLimitPerUser !== "function") {
      await replyCard(
        interaction,
        createCard({
          color: 0xed4245,
          title: "Moderation",
          body: "That channel doesn't support slowmode.",
        }),
        { ephemeral: true },
      );
      return;
    }

    try {
      await channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`);
    } catch {
      await replyCard(
        interaction,
        createCard({
          color: 0xed4245,
          title: "Moderation",
          body: "Slowmode update failed. I need **Manage Channels** permission there.",
        }),
        { ephemeral: true },
      );
      return;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: "Moderation",
        body: seconds === 0
          ? `Slowmode disabled in <#${channel.id}>.`
          : `Slowmode in <#${channel.id}> set to **${formatDuration(seconds)}**.`,
      }),
    );
  },
};
