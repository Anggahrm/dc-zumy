import { ChannelType, SlashCommandBuilder } from "discord.js";
import {
  getLoggingConfig,
  getLogEventMeta,
  isValidLogEventKey,
  LOG_EVENT_ORDER,
  setLoggingChannel,
  setLoggingEvent,
} from "#services/logging.js";
import { createCard, replyCard } from "#utils/respond.js";

function formatChannel(channelId) {
  return channelId ? `<#${channelId}>` : "- (not set)";
}

function renderEventLines(config) {
  return LOG_EVENT_ORDER.map((key) => {
    const meta = getLogEventMeta(key);
    const enabled = config.events[key] === true;
    return `${enabled ? "✅" : "❌"} ${meta?.label ?? key}`;
  });
}

function successCard(body) {
  return createCard({
    color: 0x57f287,
    title: "Logging",
    body,
  });
}

function warningCard(body) {
  return createCard({
    color: 0xf1c40f,
    title: "Logging",
    body,
  });
}

function errorCard(body) {
  return createCard({
    color: 0xed4245,
    title: "Logging",
    body,
  });
}

export default {
  category: "utility",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    admin: true,
  },
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("Manage server logging")
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
        .addStringOption((option) => {
          let configured = option
            .setName("event")
            .setDescription("Event key to toggle")
            .setRequired(false);

          for (const key of LOG_EVENT_ORDER) {
            const meta = getLogEventMeta(key);
            configured = configured.addChoices({
              name: meta?.label ?? key,
              value: key,
            });
          }

          return configured;
        }),
    ),
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
        ? successCard([
          "**Log channel cleared**",
          "- Logging channel: - (not set)",
        ].join("\n"))
        : successCard([
          "**Log channel updated**",
          `- Logging channel: <#${config.channelId}>`,
        ].join("\n"));

      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    const eventKey = interaction.options.getString("event");

    if (!eventKey) {
      const config = await getLoggingConfig(guildId);
      const card = createCard({
        color: 0x3498db,
        title: "Logging",
        body: [
          "**Current settings**",
          `- Channel: ${formatChannel(config.channelId)}`,
          "",
          ...renderEventLines(config),
        ].join("\n"),
      });

      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (!isValidLogEventKey(eventKey)) {
      await replyCard(interaction, errorCard("Invalid logging event key."), { ephemeral: true });
      return;
    }

    const currentConfig = await getLoggingConfig(guildId);
    const nextState = !currentConfig.events[eventKey];
    const config = await setLoggingEvent(guildId, eventKey, nextState);
    const meta = getLogEventMeta(eventKey);

    await replyCard(
      interaction,
      successCard([
        "**Logging event updated**",
        `- ${meta?.label ?? eventKey}: ${config.events[eventKey] ? "✅ Enabled" : "❌ Disabled"}`,
      ].join("\n")),
      { ephemeral: true },
    );
  },
};
