import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import {
  formatEmoji,
  getStarboardConfig,
  parseEmojiInput,
  updateStarboardConfig,
} from "#services/starboard.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("starboard", {
  en: {
    title: "Starboard",
    show_body: "**Current settings**\n- Channel: {channel}\n- Emoji: {emoji}\n- Threshold: **{threshold}**\n- Self-star: {selfstar}\n- Ignored channels: {ignored}",
    show_disabled: "(disabled)",
    show_selfstar_allowed: "✅ allowed",
    show_selfstar_not_counted: "❌ not counted",
    show_none: "(none)",
    channel_set: "Starboard channel set to <#{channel_id}>.",
    channel_disabled: "Starboard disabled.",
    threshold_set: "Messages now need **{count}** star(s) to be posted.",
    emoji_missing: "Please provide an emoji.",
    emoji_not_from_server: "That custom emoji is not from this server.",
    emoji_set: "Trigger emoji set to {emoji}.",
    selfstar_on: "Self-stars now count.",
    selfstar_off: "Self-stars are no longer counted.",
    ignore_on: "<#{channel_id}> is now ignored by the starboard.",
    ignore_off: "<#{channel_id}> is no longer ignored by the starboard.",
  },
  id: {
    title: "Starboard",
    show_body: "**Pengaturan saat ini**\n- Channel: {channel}\n- Emoji: {emoji}\n- Threshold: **{threshold}**\n- Self-star: {selfstar}\n- Channel yang diabaikan: {ignored}",
    show_disabled: "(nonaktif)",
    show_selfstar_allowed: "✅ boleh",
    show_selfstar_not_counted: "❌ tidak dihitung",
    show_none: "(tidak ada)",
    channel_set: "Channel starboard diatur ke <#{channel_id}>.",
    channel_disabled: "Starboard dinonaktifkan.",
    threshold_set: "Pesan sekarang butuh **{count}** star untuk diposting.",
    emoji_missing: "Tolong masukkan emoji.",
    emoji_not_from_server: "Custom emoji itu bukan dari server ini.",
    emoji_set: "Emoji pemicu diatur ke {emoji}.",
    selfstar_on: "Self-star sekarang dihitung.",
    selfstar_off: "Self-star tidak lagi dihitung.",
    ignore_on: "<#{channel_id}> sekarang diabaikan oleh starboard.",
    ignore_off: "<#{channel_id}> tidak lagi diabaikan oleh starboard.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("starboard.title"), body });
}

function warningCard(t, body) {
  return createCard({ color: 0xf1c40f, title: t("starboard.title"), body });
}

export default {
  category: "community",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("starboard")
    .setDescription("Configure the starboard")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("show").setDescription("Show starboard settings"))
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Set the starboard channel (empty to disable)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel where starred messages are posted")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("threshold")
        .setDescription("Reactions needed to reach the starboard")
        .addIntegerOption((option) =>
          option.setName("count").setDescription("1-100").setMinValue(1).setMaxValue(100).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("emoji")
        .setDescription("Set the trigger emoji")
        .addStringOption((option) =>
          option.setName("emoji").setDescription("Unicode emoji or a custom emoji from this server").setMaxLength(80).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("selfstar")
        .setDescription("Allow authors to star their own messages")
        .addBooleanOption((option) =>
          option.setName("allowed").setDescription("Count self-stars").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("ignore")
        .setDescription("Toggle a channel's starboard eligibility")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to toggle")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for starboard command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const config = await getStarboardConfig(guildId);
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: ctx.t("starboard.title"),
          body: ctx.t("starboard.show_body", {
            channel: config.channelId ? `<#${config.channelId}>` : ctx.t("starboard.show_disabled"),
            emoji: formatEmoji(config, guild),
            threshold: config.threshold,
            selfstar: config.selfStar ? ctx.t("starboard.show_selfstar_allowed") : ctx.t("starboard.show_selfstar_not_counted"),
            ignored: config.ignoredChannels.length > 0 ? config.ignoredChannels.map((id) => `<#${id}>`).join(", ") : ctx.t("starboard.show_none"),
          }),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("channel");
      await updateStarboardConfig(guildId, (config) => {
        config.channelId = channel?.id ?? null;
      });
      await replyCard(
        interaction,
        successCard(ctx.t, channel ? ctx.t("starboard.channel_set", { channel_id: channel.id }) : ctx.t("starboard.channel_disabled")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "threshold") {
      const count = interaction.options.getInteger("count", true);
      await updateStarboardConfig(guildId, (config) => {
        config.threshold = count;
      });
      await replyCard(interaction, successCard(ctx.t, ctx.t("starboard.threshold_set", { count })), {
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "emoji") {
      const parsed = parseEmojiInput(interaction.options.getString("emoji", true));
      if (!parsed) {
        await replyCard(interaction, warningCard(ctx.t, ctx.t("starboard.emoji_missing")), { ephemeral: true });
        return;
      }

      if (/^\d{5,30}$/.test(parsed) && !guild.emojis.cache.has(parsed)) {
        await replyCard(interaction, warningCard(ctx.t, ctx.t("starboard.emoji_not_from_server")), { ephemeral: true });
        return;
      }

      const { config } = await updateStarboardConfig(guildId, (c) => {
        c.emoji = parsed;
      });
      await replyCard(interaction, successCard(ctx.t, ctx.t("starboard.emoji_set", { emoji: formatEmoji(config, guild) })), {
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "selfstar") {
      const allowed = interaction.options.getBoolean("allowed", true);
      await updateStarboardConfig(guildId, (config) => {
        config.selfStar = allowed;
      });
      await replyCard(
        interaction,
        successCard(ctx.t, allowed ? ctx.t("starboard.selfstar_on") : ctx.t("starboard.selfstar_off")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "ignore") {
      const channel = interaction.options.getChannel("channel", true);
      const { result } = await updateStarboardConfig(guildId, (config) => {
        const has = config.ignoredChannels.includes(channel.id);
        config.ignoredChannels = has
          ? config.ignoredChannels.filter((id) => id !== channel.id)
          : [...config.ignoredChannels, channel.id];
        return !has;
      });

      await replyCard(
        interaction,
        successCard(ctx.t, ctx.t(result ? "starboard.ignore_on" : "starboard.ignore_off", { channel_id: channel.id })),
        { ephemeral: true },
      );
    }
  },
};
