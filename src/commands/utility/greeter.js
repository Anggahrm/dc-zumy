import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  getGreeterConfig,
  GREETER_MESSAGE_MAX_LENGTH,
  setGreeterCardEnabled,
  setGreeterChannel,
  setGreeterMessage,
} from "#services/greeter.js";
import { createCard, replyCard } from "#utils/respond.js";

function formatChannel(channelId) {
  return channelId ? `<#${channelId}>` : "(not set)";
}

function formatMessage(message) {
  return message ? message : "(default)";
}

function configLines(config) {
  return [
    "**Current config**",
    `- Welcome channel: ${formatChannel(config.welcomeChannelId)}`,
    `- Leave channel: ${formatChannel(config.leaveChannelId)}`,
    `- Welcome message: ${formatMessage(config.welcomeMessage)}`,
    `- Leave message: ${formatMessage(config.leaveMessage)}`,
    `- Image card: ${config.cardEnabled ? "✅ enabled" : "❌ disabled"}`,
  ];
}

function makeMessageOption(option) {
  return option
    .setName("message")
    .setDescription("Template ({user} {username} {server} {count}); leave empty to reset")
    .setMaxLength(GREETER_MESSAGE_MAX_LENGTH)
    .setRequired(false);
}

export default {
  category: "utility",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Configure greeter channels and messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("welcome")
        .setDescription("Set welcome channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target channel (defaults to current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leave")
        .setDescription("Set leave channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target channel (defaults to current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("welcome-message")
        .setDescription("Set custom welcome message template")
        .addStringOption(makeMessageOption),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leave-message")
        .setDescription("Set custom leave message template")
        .addStringOption(makeMessageOption),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("card")
        .setDescription("Toggle rendered welcome/leave image cards")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Attach a generated image card").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show current greeter configuration"),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for set command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const config = await getGreeterConfig(guildId);
      const card = createCard({
        color: 0x3498db,
        title: "Greeter",
        body: [
          ...configLines(config),
          "",
          "**Template variables**",
          "- `{user}` mention, `{username}` name, `{server}` server name, `{count}` member count",
        ].join("\n"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (subcommand === "card") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const config = await setGreeterCardEnabled(guildId, enabled);
      const card = createCard({
        color: 0x57f287,
        title: "Greeter",
        body: [
          `**Image card ${enabled ? "enabled" : "disabled"}**`,
          ...(enabled ? ["- Welcome/leave messages now include a rendered card with the member's avatar."] : []),
          "",
          ...configLines(config),
        ].join("\n"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (subcommand === "welcome-message" || subcommand === "leave-message") {
      const type = subcommand === "welcome-message" ? "welcome" : "leave";
      const message = interaction.options.getString("message");
      const config = await setGreeterMessage(guildId, type, message);
      const updated = type === "welcome" ? config.welcomeMessage : config.leaveMessage;

      const card = createCard({
        color: 0x57f287,
        title: "Greeter",
        body: [
          `**${type === "welcome" ? "Welcome" : "Leave"} message ${updated ? "updated" : "reset to default"}**`,
          ...(updated ? [`- Template: ${updated}`] : []),
          "",
          ...configLines(config),
        ].join("\n"),
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    const providedChannel = interaction.options.getChannel("channel");
    const selectedChannel = providedChannel ?? interaction.channel;

    if (!selectedChannel || !selectedChannel.isTextBased() || selectedChannel.guildId !== guild.id) {
      const invalidCard = createCard({
        color: 0xed4245,
        title: "Greeter",
        body: "Please run this command in a server text channel or choose a valid channel.",
      });
      await replyCard(interaction, invalidCard, { ephemeral: true });
      return;
    }

    await setGreeterChannel(guildId, subcommand, selectedChannel.id);
    const config = await getGreeterConfig(guildId);

    const card = createCard({
      color: 0x57f287,
      title: "Greeter",
      body: [
        "**Channel updated**",
        `- ${subcommand === "welcome" ? "Welcome" : "Leave"} channel: <#${selectedChannel.id}>`,
        "",
        ...configLines(config),
      ].join("\n"),
    });

    await replyCard(interaction, card, { ephemeral: true });
  },
};
