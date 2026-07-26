import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import {
  getLoggingConfig,
  getLogEventMeta,
  isValidLogEventKey,
  LOG_EVENT_ORDER,
  setLoggingChannel,
  setLoggingEvent,
} from "#services/logging.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("log", {
  en: {
    title: "Logging",
    not_set: "- (not set)",
    channel_cleared: "**Log channel cleared**\n- Logging channel: - (not set)",
    channel_updated: "**Log channel updated**\n- Logging channel: <#{channel_id}>",
    current_settings_header: "**Current settings**",
    channel_line: "- Channel: {channel}",
    invalid_event_key: "Invalid logging event key.",
    event_updated: "**Logging event updated**\n- {label}: {state}",
    state_enabled: "✅ Enabled",
    state_disabled: "❌ Disabled",
  },
  id: {
    title: "Logging",
    not_set: "- (belum diatur)",
    channel_cleared: "**Channel log dihapus**\n- Channel logging: - (belum diatur)",
    channel_updated: "**Channel log diperbarui**\n- Channel logging: <#{channel_id}>",
    current_settings_header: "**Pengaturan saat ini**",
    channel_line: "- Channel: {channel}",
    invalid_event_key: "Key event logging tidak valid.",
    event_updated: "**Event logging diperbarui**\n- {label}: {state}",
    state_enabled: "✅ Aktif",
    state_disabled: "❌ Nonaktif",
  },
});

function formatChannel(t, channelId) {
  return channelId ? `<#${channelId}>` : t("log.not_set");
}

function renderEventLines(config) {
  return LOG_EVENT_ORDER.map((key) => {
    const meta = getLogEventMeta(key);
    const enabled = config.events[key] === true;
    return `${enabled ? "✅" : "❌"} ${meta?.label ?? key}`;
  });
}

function successCard(t, body) {
  return createCard({
    color: 0x57f287,
    title: t("log.title"),
    body,
  });
}

function warningCard(t, body) {
  return createCard({
    color: 0xf1c40f,
    title: t("log.title"),
    body,
  });
}

function errorCard(t, body) {
  return createCard({
    color: 0xed4245,
    title: t("log.title"),
    body,
  });
}

export default {
  category: "utility",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("Manage server logging")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("Set log channel (leave empty to clear)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target log channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")
        .setDescription("Show or toggle logging events")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Event to toggle (leave empty to show all)")
            .setAutocomplete(true)
            .setRequired(false),
        ),
    ),
  async autocomplete({ interaction }) {
    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const matches = LOG_EVENT_ORDER
      .map((key) => ({ key, label: getLogEventMeta(key)?.label ?? key }))
      .filter(({ key, label }) => !query || key.includes(query) || label.toLowerCase().includes(query))
      .slice(0, 25)
      .map(({ key, label }) => ({ name: label, value: key }));
    await interaction.respond(matches);
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for log command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "channel") {
      const selectedChannel = interaction.options.getChannel("channel");
      const config = await setLoggingChannel(guildId, selectedChannel?.id ?? null);
      const cleared = !selectedChannel;

      const card = cleared
        ? successCard(ctx.t, ctx.t("log.channel_cleared"))
        : successCard(ctx.t, ctx.t("log.channel_updated", { channel_id: config.channelId }));

      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    const eventKey = interaction.options.getString("event");

    if (!eventKey) {
      const config = await getLoggingConfig(guildId);
      const card = createCard({
        color: 0x3498db,
        title: ctx.t("log.title"),
        body: [
          ctx.t("log.current_settings_header"),
          ctx.t("log.channel_line", { channel: formatChannel(ctx.t, config.channelId) }),
          "",
          ...renderEventLines(config),
        ].join("\n"),
      });

      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (!isValidLogEventKey(eventKey)) {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("log.invalid_event_key")), { ephemeral: true });
      return;
    }

    const currentConfig = await getLoggingConfig(guildId);
    const nextState = !currentConfig.events[eventKey];
    const config = await setLoggingEvent(guildId, eventKey, nextState);
    const meta = getLogEventMeta(eventKey);

    await replyCard(
      interaction,
      successCard(ctx.t, ctx.t("log.event_updated", {
        label: meta?.label ?? eventKey,
        state: config.events[eventKey] ? ctx.t("log.state_enabled") : ctx.t("log.state_disabled"),
      })),
      { ephemeral: true },
    );
  },
};
