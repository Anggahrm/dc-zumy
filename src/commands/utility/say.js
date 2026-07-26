import {
  ActionRowBuilder,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";

const CUSTOM_ID_PREFIX = "say:";

export default {
  category: "utility",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Compose an announcement card via a form")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Target channel (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ),
  async onComponent({ interaction }) {
    if (!interaction.isModalSubmit()) return false;
    if (!interaction.customId.startsWith(CUSTOM_ID_PREFIX)) return false;

    const channelId = interaction.customId.slice(CUSTOM_ID_PREFIX.length);
    const guild = interaction.guild;
    if (!guild) {
      await replyError(interaction, "This form only works in a server.");
      return true;
    }

    // Re-check permission at submit time: the modal could be resolved after
    // the member's roles changed.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await replyError(interaction, "You need the **Manage Server** permission to post announcements.");
      return true;
    }

    const channel = guild.channels.cache.get(channelId)
      ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
      await replyError(interaction, "That channel is no longer available.");
      return true;
    }

    const title = interaction.fields.getTextInputValue("title")?.trim() ?? "";
    const body = interaction.fields.getTextInputValue("body")?.trim();
    if (!body) {
      await replyError(interaction, "The message body cannot be empty.");
      return true;
    }

    try {
      await channel.send({
        components: [
          createCard({
            color: 0x5865f2,
            title: title || null,
            body,
            footer: `Posted by ${interaction.user.tag}`,
          }),
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    } catch {
      await replyError(interaction, "I couldn't send the message to that channel. Check my permissions there.");
      return true;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: "Say",
        body: `Announcement posted to <#${channel.id}>.`,
      }),
      { ephemeral: true },
    );
    return true;
  },
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for say command.");
    }

    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    if (!channel || !channel.isTextBased()) {
      await replyError(interaction, "Pick a text channel I can post in.");
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}${channel.id}`)
      .setTitle("Compose announcement")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("title")
            .setLabel("Title (optional)")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("body")
            .setLabel("Message")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(2000)
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);
  },
};
