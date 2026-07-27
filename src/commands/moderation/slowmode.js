import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

const MAX_SLOWMODE_SECONDS = 21600;

registerStrings("slowmode", {
  en: {
    title: "Moderation",
    unsupported_channel: "That channel doesn't support slowmode.",
    update_failed: "I couldn't change slowmode. I need **Manage Channels** permission there.",
    disabled: "Slowmode is off in <#{channelId}>.",
    set: "Slowmode in <#{channelId}> set to **{duration}**.",
  },
  id: {
    title: "Moderasi",
    unsupported_channel: "Channel itu tidak mendukung slowmode.",
    update_failed: "Gagal mengubah slowmode. Aku butuh permission **Manage Channels** di sana.",
    disabled: "Slowmode dimatikan di <#{channelId}>.",
    set: "Slowmode di <#{channelId}> diatur ke **{duration}**.",
  },
});

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageChannels],
  },
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode (0 to turn it off)")
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
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for slowmode command.");
    }

    const t = ctx.t;
    const seconds = interaction.options.getInteger("seconds", true);
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;

    if (!channel || typeof channel.setRateLimitPerUser !== "function") {
      await replyCard(
        interaction,
        createCard({
          color: 0xed4245,
          title: t("slowmode.title"),
          body: t("slowmode.unsupported_channel"),
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
          title: t("slowmode.title"),
          body: t("slowmode.update_failed"),
        }),
        { ephemeral: true },
      );
      return;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: t("slowmode.title"),
        body: seconds === 0
          ? t("slowmode.disabled", { channelId: channel.id })
          : t("slowmode.set", { channelId: channel.id, duration: formatDuration(seconds) }),
      }),
    );
  },
};
