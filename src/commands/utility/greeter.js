import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getGreeterConfig, setGreeterChannel } from "#services/greeter.js";
import { createCard, replyCard } from "#utils/respond.js";

function formatChannel(channelId) {
  return channelId ? `<#${channelId}>` : "- (not set)";
}

export default {
  category: "utility",
  cooldown: 2,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Set greeter channels")
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
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for set command.");
    }

    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (!isAdmin) {
      await interaction.reply({
        content: "Sorry this command only for administrator.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
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

    await setGreeterChannel(guild.id, subcommand, selectedChannel.id);
    const config = await getGreeterConfig(guild.id);

    const card = createCard({
      color: 0x57f287,
      title: "Greeter",
      body: [
        "**Channel updated**",
        `- ${subcommand === "welcome" ? "Welcome" : "Leave"} channel: <#${selectedChannel.id}>`,
        "",
        "**Current config**",
        `- Welcome: ${formatChannel(config.welcomeChannelId)}`,
        `- Leave: ${formatChannel(config.leaveChannelId)}`,
      ].join("\n"),
    });

    await replyCard(interaction, card, { ephemeral: true });
  },
};
