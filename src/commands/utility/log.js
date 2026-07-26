import {
  ActionRowBuilder,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
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
    panel_title: "Logging panel",
    panel_body: "**Channel:** {channel}\nToggle events by picking them below — selected entries flip on/off instantly.",
    panel_group_a: "Messages & members...",
    panel_group_b: "Server, voice & more...",
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
    panel_title: "Panel logging",
    panel_body: "**Channel:** {channel}\nAktif/nonaktifkan event dengan memilihnya di bawah — pilihan langsung di-toggle.",
    panel_group_a: "Pesan & member...",
    panel_group_b: "Server, voice & lainnya...",
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

const PANEL_PREFIX = "logpanel:";

function buildPanelSelect(t, config, groupKey, keys) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${PANEL_PREFIX}${groupKey}`)
      .setPlaceholder(t(groupKey === "a" ? "log.panel_group_a" : "log.panel_group_b"))
      .setMinValues(0)
      .setMaxValues(keys.length)
      .addOptions(
        keys.map((key) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${config.events[key] ? "✅" : "❌"} ${getLogEventMeta(key)?.label ?? key}`)
            .setValue(key),
        ),
      ),
  );
}

function buildPanelPayload(t, config) {
  const half = Math.ceil(LOG_EVENT_ORDER.length / 2);
  const groupA = LOG_EVENT_ORDER.slice(0, half);
  const groupB = LOG_EVENT_ORDER.slice(half);

  return {
    components: [
      createCard({
        color: 0x3498db,
        title: t("log.panel_title"),
        body: t("log.panel_body", { channel: formatChannel(t, config.channelId) }),
      }),
      buildPanelSelect(t, config, "a", groupA),
      buildPanelSelect(t, config, "b", groupB),
    ],
  };
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
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("panel")
        .setDescription("Interactive panel to toggle all log events at once"),
    ),
  async onComponent({ interaction, t }) {
    if (!interaction.isStringSelectMenu()) return false;
    if (!interaction.customId.startsWith(PANEL_PREFIX)) return false;

    const guild = interaction.guild;
    if (!guild) return false;

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return false;
    }

    for (const key of interaction.values) {
      if (!isValidLogEventKey(key)) continue;
      const current = await getLoggingConfig(guild.id);
      await setLoggingEvent(guild.id, key, !current.events[key]);
    }

    const config = await getLoggingConfig(guild.id);
    await interaction.update(buildPanelPayload(t, config));
    return true;
  },
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

    if (subcommand === "panel") {
      const config = await getLoggingConfig(guildId);
      await interaction.reply({
        ...buildPanelPayload(ctx.t, config),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

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
