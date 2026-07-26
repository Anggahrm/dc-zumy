import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  buildGreeterPreview,
  getGreeterConfig,
  GREETER_MESSAGE_MAX_LENGTH,
  setGreeterCardEnabled,
  setGreeterChannel,
  setGreeterMessage,
} from "#services/greeter.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("set", {
  en: {
    title: "Greeter",
    not_set: "(not set)",
    default_label: "(default)",
    current_config: "**Current config**",
    line_welcome_channel: "- Welcome channel: {channel}",
    line_leave_channel: "- Leave channel: {channel}",
    line_welcome_message: "- Welcome message: {message}",
    line_leave_message: "- Leave message: {message}",
    line_card_enabled: "- Image card: ✅ enabled",
    line_card_disabled: "- Image card: ❌ disabled",
    template_variables: "**Template variables**",
    template_vars_line: "- `{user}` mention, `{username}` name, `{server}` server name, `{count}` member count",
    card_enabled_title: "**Image card enabled**",
    card_disabled_title: "**Image card disabled**",
    card_enabled_note: "- Welcome/leave messages now include a rendered card with the member's avatar.",
    welcome_message_updated: "**Welcome message updated**",
    welcome_message_reset: "**Welcome message reset to default**",
    leave_message_updated: "**Leave message updated**",
    leave_message_reset: "**Leave message reset to default**",
    line_template: "- Template: {template}",
    invalid_channel: "Please run this command in a server text channel or choose a valid channel.",
    channel_updated: "**Channel updated**",
    welcome_channel_set: "- Welcome channel: <#{channel_id}>",
    leave_channel_set: "- Leave channel: <#{channel_id}>",
  },
  id: {
    title: "Greeter",
    not_set: "(belum diatur)",
    default_label: "(default)",
    current_config: "**Konfigurasi saat ini**",
    line_welcome_channel: "- Channel welcome: {channel}",
    line_leave_channel: "- Channel leave: {channel}",
    line_welcome_message: "- Pesan welcome: {message}",
    line_leave_message: "- Pesan leave: {message}",
    line_card_enabled: "- Kartu gambar: ✅ aktif",
    line_card_disabled: "- Kartu gambar: ❌ nonaktif",
    template_variables: "**Variabel template**",
    template_vars_line: "- `{user}` mention, `{username}` nama, `{server}` nama server, `{count}` jumlah member",
    card_enabled_title: "**Kartu gambar diaktifkan**",
    card_disabled_title: "**Kartu gambar dinonaktifkan**",
    card_enabled_note: "- Pesan welcome/leave sekarang menyertakan kartu gambar dengan avatar member.",
    welcome_message_updated: "**Pesan welcome diperbarui**",
    welcome_message_reset: "**Pesan welcome dikembalikan ke default**",
    leave_message_updated: "**Pesan leave diperbarui**",
    leave_message_reset: "**Pesan leave dikembalikan ke default**",
    line_template: "- Template: {template}",
    invalid_channel: "Jalankan command ini di text channel server atau pilih channel yang valid.",
    channel_updated: "**Channel diperbarui**",
    welcome_channel_set: "- Channel welcome: <#{channel_id}>",
    leave_channel_set: "- Channel leave: <#{channel_id}>",
  },
});

function formatChannel(channelId, t) {
  return channelId ? `<#${channelId}>` : t("set.not_set");
}

function formatMessage(message, t) {
  return message ? message : t("set.default_label");
}

function configLines(config, t) {
  return [
    t("set.current_config"),
    t("set.line_welcome_channel", { channel: formatChannel(config.welcomeChannelId, t) }),
    t("set.line_leave_channel", { channel: formatChannel(config.leaveChannelId, t) }),
    t("set.line_welcome_message", { message: formatMessage(config.welcomeMessage, t) }),
    t("set.line_leave_message", { message: formatMessage(config.leaveMessage, t) }),
    config.cardEnabled ? t("set.line_card_enabled") : t("set.line_card_disabled"),
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
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("test")
        .setDescription("Preview the welcome and leave messages (only you see it)"),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for set command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "test") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const welcome = await buildGreeterPreview({ guild, user: interaction.user, type: "welcome" });
      const leave = await buildGreeterPreview({ guild, user: interaction.user, type: "leave" });

      await interaction.editReply({
        components: [...welcome.components, ...leave.components],
        files: [...welcome.files, ...leave.files],
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === "show") {
      const config = await getGreeterConfig(guildId);
      const card = createCard({
        color: 0x3498db,
        title: ctx.t("set.title"),
        body: [
          ...configLines(config, ctx.t),
          "",
          ctx.t("set.template_variables"),
          ctx.t("set.template_vars_line"),
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
        title: ctx.t("set.title"),
        body: [
          enabled ? ctx.t("set.card_enabled_title") : ctx.t("set.card_disabled_title"),
          ...(enabled ? [ctx.t("set.card_enabled_note")] : []),
          "",
          ...configLines(config, ctx.t),
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

      const headerKey = type === "welcome"
        ? (updated ? "set.welcome_message_updated" : "set.welcome_message_reset")
        : (updated ? "set.leave_message_updated" : "set.leave_message_reset");

      const card = createCard({
        color: 0x57f287,
        title: ctx.t("set.title"),
        body: [
          ctx.t(headerKey),
          ...(updated ? [ctx.t("set.line_template", { template: updated })] : []),
          "",
          ...configLines(config, ctx.t),
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
        title: ctx.t("set.title"),
        body: ctx.t("set.invalid_channel"),
      });
      await replyCard(interaction, invalidCard, { ephemeral: true });
      return;
    }

    await setGreeterChannel(guildId, subcommand, selectedChannel.id);
    const config = await getGreeterConfig(guildId);

    const card = createCard({
      color: 0x57f287,
      title: ctx.t("set.title"),
      body: [
        ctx.t("set.channel_updated"),
        ctx.t(subcommand === "welcome" ? "set.welcome_channel_set" : "set.leave_channel_set", {
          channel_id: selectedChannel.id,
        }),
        "",
        ...configLines(config, ctx.t),
      ].join("\n"),
    });

    await replyCard(interaction, card, { ephemeral: true });
  },
};
