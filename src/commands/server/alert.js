import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  createAlert,
  deleteAlert,
  fetchYoutubeFeed,
  getAlerts,
  MAX_ALERTS,
  parseYoutubeChannelId,
} from "#services/alerts.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("alert", {
  en: {
    title: "Alerts",
    invalid_channel_id: "That doesn't look like a YouTube channel ID.\n- Use the `UC...` id from the channel URL (`youtube.com/channel/UC...`).\n-# Tip: on a channel page, Share → Copy channel ID.",
    pick_text_channel: "Pick a text channel in this server.",
    feed_fetch_failed: "I couldn't fetch that channel's feed. Double-check the channel ID.",
    reason_invalid_name: "Alert names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
    reason_exists: "An alert with that name already exists.",
    reason_full: "Alert limit reached (max {max}).",
    create_failed: "Could not create the alert.",
    watch_created: "Watching **{channel_name}** for new uploads.\n- Announcements in <#{channel_id}>\n- Checked every ~10 minutes.",
    removed: "Alert removed.",
    not_found: "No alert with that name.",
    list_line: "- `{name}` — YouTube `{youtube_id}` → <#{channel_id}>",
    list_empty: "No alerts yet. Use `/alert add` with a YouTube channel ID.",
  },
  id: {
    title: "Alert",
    invalid_channel_id: "Itu sepertinya bukan channel ID YouTube.\n- Pakai id `UC...` dari URL channel-nya (`youtube.com/channel/UC...`).\n-# Tip: di halaman channel, Share → Copy channel ID.",
    pick_text_channel: "Pilih text channel di server ini.",
    feed_fetch_failed: "Aku tidak bisa mengambil feed channel itu. Cek lagi channel ID-nya.",
    reason_invalid_name: "Nama alert harus 1-32 karakter: huruf kecil, angka, `-`, `_`.",
    reason_exists: "Alert dengan nama itu sudah ada.",
    reason_full: "Limit alert tercapai (maksimal {max}).",
    create_failed: "Tidak bisa membuat alert-nya.",
    watch_created: "Memantau **{channel_name}** untuk upload baru.\n- Pengumuman di <#{channel_id}>\n- Dicek setiap ~10 menit.",
    removed: "Alert dihapus.",
    not_found: "Tidak ada alert dengan nama itu.",
    list_line: "- `{name}` — YouTube `{youtube_id}` → <#{channel_id}>",
    list_empty: "Belum ada alert. Pakai `/alert add` dengan channel ID YouTube.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("alert.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("alert.title"), body });
}

export default {
  category: "server",
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
          errorCard(ctx.t, ctx.t("alert.invalid_channel_id")),
          { ephemeral: true },
        );
        return;
      }

      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel?.isTextBased() || typeof channel.send !== "function" || channel.guildId !== guild.id) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("alert.pick_text_channel")), { ephemeral: true });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Validate the feed and seed lastVideoId so old uploads aren't spammed.
      const feed = await fetchYoutubeFeed(youtubeChannelId);
      if (!feed) {
        await replyCard(
          interaction,
          errorCard(ctx.t, ctx.t("alert.feed_fetch_failed")),
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
          invalid_name: ctx.t("alert.reason_invalid_name"),
          exists: ctx.t("alert.reason_exists"),
          full: ctx.t("alert.reason_full", { max: MAX_ALERTS }),
        };
        await replyCard(interaction, errorCard(ctx.t, reasons[result.reason] ?? ctx.t("alert.create_failed")), {
          ephemeral: true,
        });
        return;
      }

      await replyCard(
        interaction,
        successCard(ctx.t, ctx.t("alert.watch_created", { channel_name: feed.channelName, channel_id: channel.id })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const removed = await deleteAlert(guildId, interaction.options.getString("name", true));
      await replyCard(
        interaction,
        removed ? successCard(ctx.t, ctx.t("alert.removed")) : errorCard(ctx.t, ctx.t("alert.not_found")),
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
          title: ctx.t("alert.title"),
          body: names.length > 0
            ? names
              .map((name) => {
                const alert = alerts[name];
                return ctx.t("alert.list_line", {
                  name,
                  youtube_id: alert.youtubeChannelId,
                  channel_id: alert.targetChannelId,
                });
              })
              .join("\n")
            : ctx.t("alert.list_empty"),
        }),
        { ephemeral: true },
      );
    }
  },
};
