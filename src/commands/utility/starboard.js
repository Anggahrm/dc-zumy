import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  formatEmoji,
  getStarboardConfig,
  parseEmojiInput,
  updateStarboardConfig,
} from "#services/starboard.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Starboard", body });
}

function warningCard(body) {
  return createCard({ color: 0xf1c40f, title: "Starboard", body });
}

export default {
  category: "utility",
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
          title: "Starboard",
          body: [
            "**Current settings**",
            `- Channel: ${config.channelId ? `<#${config.channelId}>` : "(disabled)"}`,
            `- Emoji: ${formatEmoji(config, guild)}`,
            `- Threshold: **${config.threshold}**`,
            `- Self-star: ${config.selfStar ? "✅ allowed" : "❌ not counted"}`,
            `- Ignored channels: ${config.ignoredChannels.length > 0 ? config.ignoredChannels.map((id) => `<#${id}>`).join(", ") : "(none)"}`,
          ].join("\n"),
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
        successCard(channel ? `Starboard channel set to <#${channel.id}>.` : "Starboard disabled."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "threshold") {
      const count = interaction.options.getInteger("count", true);
      await updateStarboardConfig(guildId, (config) => {
        config.threshold = count;
      });
      await replyCard(interaction, successCard(`Messages now need **${count}** star(s) to be posted.`), {
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "emoji") {
      const parsed = parseEmojiInput(interaction.options.getString("emoji", true));
      if (!parsed) {
        await replyCard(interaction, warningCard("Please provide an emoji."), { ephemeral: true });
        return;
      }

      if (/^\d{5,30}$/.test(parsed) && !guild.emojis.cache.has(parsed)) {
        await replyCard(interaction, warningCard("That custom emoji is not from this server."), { ephemeral: true });
        return;
      }

      const { config } = await updateStarboardConfig(guildId, (c) => {
        c.emoji = parsed;
      });
      await replyCard(interaction, successCard(`Trigger emoji set to ${formatEmoji(config, guild)}.`), {
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
        successCard(allowed ? "Self-stars now count." : "Self-stars are no longer counted."),
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
        successCard(`<#${channel.id}> is ${result ? "now ignored by" : "no longer ignored by"} the starboard.`),
        { ephemeral: true },
      );
    }
  },
};
