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
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";

registerStrings("say", {
  en: {
    title: "Say",
    guild_only_form: "This form only works in a server.",
    need_manage_server: "You need the **Manage Server** permission to post announcements.",
    channel_unavailable: "That channel is no longer available.",
    empty_body: "Type the message you want to post.",
    send_failed: "I couldn't send the message to that channel. Check my permissions there.",
    posted_by: "Posted by {tag}",
    posted: "Announcement posted to <#{channel_id}>.",
    pick_text_channel: "Pick a text channel I can post in.",
    modal_title: "Compose announcement",
    modal_label_title: "Title (optional)",
    modal_label_body: "Message",
  },
  id: {
    title: "Say",
    guild_only_form: "Form ini hanya bisa dipakai di server.",
    need_manage_server: "Kamu butuh permission **Manage Server** untuk memposting pengumuman.",
    channel_unavailable: "Channel itu sudah tidak tersedia.",
    empty_body: "Ketik pesan yang mau kamu posting.",
    send_failed: "Aku tidak bisa mengirim pesan ke channel itu. Cek permission-ku di sana.",
    posted_by: "Diposting oleh {tag}",
    posted: "Pengumuman diposting ke <#{channel_id}>.",
    pick_text_channel: "Pilih text channel yang bisa kupakai untuk posting.",
    modal_title: "Tulis pengumuman",
    modal_label_title: "Judul (opsional)",
    modal_label_body: "Pesan",
  },
});

const CUSTOM_ID_PREFIX = "say:";

export default {
  category: "server",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Write an announcement in a pop-up form")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Target channel (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ),
  async onComponent({ interaction, t }) {
    if (!interaction.isModalSubmit()) return false;
    if (!interaction.customId.startsWith(CUSTOM_ID_PREFIX)) return false;

    const channelId = interaction.customId.slice(CUSTOM_ID_PREFIX.length);
    const guild = interaction.guild;
    if (!guild) {
      await replyError(interaction, t("say.guild_only_form"));
      return true;
    }

    // Re-check permission at submit time: the modal could be resolved after
    // the member's roles changed.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await replyError(interaction, t("say.need_manage_server"));
      return true;
    }

    const channel = guild.channels.cache.get(channelId)
      ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
      await replyError(interaction, t("say.channel_unavailable"));
      return true;
    }

    const title = interaction.fields.getTextInputValue("title")?.trim() ?? "";
    const body = interaction.fields.getTextInputValue("body")?.trim();
    if (!body) {
      await replyError(interaction, t("say.empty_body"));
      return true;
    }

    try {
      await channel.send({
        components: [
          createCard({
            color: 0x5865f2,
            title: title || null,
            body,
            footer: t("say.posted_by", { tag: interaction.user.tag }),
          }),
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    } catch {
      await replyError(interaction, t("say.send_failed"));
      return true;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: t("say.title"),
        body: t("say.posted", { channel_id: channel.id }),
      }),
      { ephemeral: true },
    );
    return true;
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for say command.");
    }

    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    if (!channel || !channel.isTextBased()) {
      await replyError(interaction, ctx.t("say.pick_text_channel"));
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}${channel.id}`)
      .setTitle(ctx.t("say.modal_title"))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("title")
            .setLabel(ctx.t("say.modal_label_title"))
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("body")
            .setLabel(ctx.t("say.modal_label_body"))
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(2000)
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);
  },
};
