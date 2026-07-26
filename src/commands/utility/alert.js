import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  createAlert,
  deleteAlert,
  fetchYoutubeFeed,
  getAlerts,
  MAX_ALERTS,
  parseYoutubeChannelId,
} from "#services/alerts.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Alerts", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Alerts", body });
}

export default {
  category: "utility",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("alert")
    .setDescription("Social notifications (YouTube uploads)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Watch a YouTube channel for new uploads")
        .addStringOption((option) =>
          option.setName("name").setDescription("Alert name (lowercase, no spaces)").setMaxLength(32).setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("youtube_channel")
            .setDescription("Channel ID (UC...) or youtube.com/channel/UC... URL")
            .setMaxLength(120)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Where to announce (defaults to current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Template: {channel} {title} {url} {server} (empty = default)")
            .setMaxLength(300)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Stop watching a channel")
        .addStringOption((option) =>
          option.setName("name").setDescription("Alert name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List configured alerts")),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const alerts = await getAlerts(interaction.guildId, { preferCache: true });
    await interaction.respond(
      Object.keys(alerts)
        .filter((name) => !query || name.includes(query))
        .sort()
        .slice(0, 25)
        .map((name) => ({ name, value: name })),
    );
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for alert command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const youtubeChannelId = parseYoutubeChannelId(interaction.options.getString("youtube_channel", true));
      if (!youtubeChannelId) {
        await replyCard(
          interaction,
          errorCard([
            "That doesn't look like a YouTube channel ID.",
            "- Use the `UC...` id from the channel URL (`youtube.com/channel/UC...`).",
            "-# Tip: on a channel page, Share → Copy channel ID.",
          ].join("\n")),
          { ephemeral: true },
        );
        return;
      }

      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel?.isTextBased() || typeof channel.send !== "function" || channel.guildId !== guild.id) {
        await replyCard(interaction, errorCard("Pick a text channel in this server."), { ephemeral: true });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Validate the feed and seed lastVideoId so old uploads aren't spammed.
      const feed = await fetchYoutubeFeed(youtubeChannelId);
      if (!feed) {
        await replyCard(
          interaction,
          errorCard("I couldn't fetch that channel's feed. Double-check the channel ID."),
          { ephemeral: true },
        );
        return;
      }

      const result = await createAlert(guildId, interaction.options.getString("name", true), {
        youtubeChannelId,
        targetChannelId: channel.id,
        message: interaction.options.getString("message")?.trim() || null,
        lastVideoId: feed.videos[0]?.videoId ?? null,
      });

      if (!result.ok) {
        const reasons = {
          invalid_name: "Alert names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
          exists: "An alert with that name already exists.",
          full: `Alert limit reached (max ${MAX_ALERTS}).`,
        };
        await replyCard(interaction, errorCard(reasons[result.reason] ?? "Could not create the alert."), {
          ephemeral: true,
        });
        return;
      }

      await replyCard(
        interaction,
        successCard([
          `Watching **${feed.channelName}** for new uploads.`,
          `- Announcements in <#${channel.id}>`,
          "- Checked every ~10 minutes.",
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const removed = await deleteAlert(guildId, interaction.options.getString("name", true));
      await replyCard(
        interaction,
        removed ? successCard("Alert removed.") : errorCard("No alert with that name."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const alerts = await getAlerts(guildId);
      const names = Object.keys(alerts).sort();
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Alerts",
          body: names.length > 0
            ? names
              .map((name) => {
                const alert = alerts[name];
                return `- \`${name}\` — YouTube \`${alert.youtubeChannelId}\` → <#${alert.targetChannelId}>`;
              })
              .join("\n")
            : "No alerts yet. Use `/alert add` with a YouTube channel ID.",
        }),
        { ephemeral: true },
      );
    }
  },
};
