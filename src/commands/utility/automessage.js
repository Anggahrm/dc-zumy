import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  automessageJobKey,
  createAutomessage,
  deleteAutomessage,
  getAutomessages,
  MAX_AUTOMESSAGE_LENGTH,
  MAX_AUTOMESSAGES,
  MAX_INTERVAL_MS,
  MIN_INTERVAL_MS,
} from "#services/automessages.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

registerStrings("automessage", {
  en: {
    title: "Auto-messages",
    interval_invalid: "Interval must be between **30m** and **7d** (e.g. `1h`, `12h`, `1d`).",
    pick_text_channel: "Pick a text channel in this server.",
    reason_invalid_name: "Names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
    reason_exists: "An auto-message with that name already exists.",
    reason_full: "Limit reached (max {max}).",
    create_failed: "Could not create it.",
    created: "Auto-message `{name}` created.\n- Channel: <#{channel_id}>\n- Every: **{interval}** (first post in one interval)",
    deleted: "Auto-message deleted.",
    not_found: "No auto-message with that name.",
    list_line: "- `{name}` — every **{interval}** in <#{channel_id}>",
    list_empty: "No auto-messages yet. Use `/automessage add`.",
  },
  id: {
    title: "Pesan Otomatis",
    interval_invalid: "Interval harus antara **30m** dan **7d** (contoh: `1h`, `12h`, `1d`).",
    pick_text_channel: "Pilih text channel di server ini.",
    reason_invalid_name: "Nama harus 1-32 karakter: huruf kecil, angka, `-`, `_`.",
    reason_exists: "Pesan otomatis dengan nama itu sudah ada.",
    reason_full: "Limit tercapai (maksimal {max}).",
    create_failed: "Tidak bisa membuatnya.",
    created: "Pesan otomatis `{name}` dibuat.\n- Channel: <#{channel_id}>\n- Setiap: **{interval}** (post pertama setelah satu interval)",
    deleted: "Pesan otomatis dihapus.",
    not_found: "Tidak ada pesan otomatis dengan nama itu.",
    list_line: "- `{name}` — setiap **{interval}** di <#{channel_id}>",
    list_empty: "Belum ada pesan otomatis. Pakai `/automessage add`.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("automessage.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("automessage.title"), body });
}

export default {
  category: "utility",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("automessage")
    .setDescription("Recurring scheduled messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Create a recurring message")
        .addStringOption((option) =>
          option.setName("name").setDescription("Name (lowercase, no spaces)").setMaxLength(32).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("interval").setDescription("How often, e.g. 1h, 12h, 1d (30m-7d)").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("content")
            .setDescription("Message content ({server} supported)")
            .setMaxLength(MAX_AUTOMESSAGE_LENGTH)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target channel (defaults to current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete a recurring message")
        .addStringOption((option) =>
          option.setName("name").setDescription("Name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List recurring messages")),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const automessages = await getAutomessages(interaction.guildId, { preferCache: true });
    await interaction.respond(
      Object.keys(automessages)
        .filter((name) => !query || name.includes(query))
        .sort()
        .slice(0, 25)
        .map((name) => ({ name, value: name })),
    );
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for automessage command.");
    }

    const scheduler = interaction.client.zumy?.scheduler;
    if (!scheduler) {
      throw new Error("Scheduler is not available.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const intervalMs = parseDuration(interaction.options.getString("interval", true));
      if (!intervalMs || intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("automessage.interval_invalid")), {
          ephemeral: true,
        });
        return;
      }

      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel?.isTextBased() || typeof channel.send !== "function" || channel.guildId !== guild.id) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("automessage.pick_text_channel")), { ephemeral: true });
        return;
      }

      const result = await createAutomessage(guildId, interaction.options.getString("name", true), {
        channelId: channel.id,
        content: interaction.options.getString("content", true),
        intervalMs,
      });

      if (!result.ok) {
        const reasons = {
          invalid_name: ctx.t("automessage.reason_invalid_name"),
          exists: ctx.t("automessage.reason_exists"),
          full: ctx.t("automessage.reason_full", { max: MAX_AUTOMESSAGES }),
        };
        await replyCard(interaction, errorCard(ctx.t, reasons[result.reason] ?? ctx.t("automessage.create_failed")), { ephemeral: true });
        return;
      }

      await scheduler.schedule({
        type: "automessage",
        runAt: new Date(Date.now() + intervalMs),
        guildId: guild.id,
        payload: { name: result.name },
        dedupeKey: automessageJobKey(guild.id, result.name),
      });

      await replyCard(
        interaction,
        successCard(ctx.t, ctx.t("automessage.created", {
          name: result.name,
          channel_id: channel.id,
          interval: formatDuration(intervalMs / 1000),
        })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const name = interaction.options.getString("name", true).trim().toLowerCase();
      const removed = await deleteAutomessage(guildId, name);
      if (removed) {
        await scheduler.cancelByKey(automessageJobKey(guild.id, name)).catch(() => {});
      }

      await replyCard(
        interaction,
        removed ? successCard(ctx.t, ctx.t("automessage.deleted")) : errorCard(ctx.t, ctx.t("automessage.not_found")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const automessages = await getAutomessages(guildId);
      const names = Object.keys(automessages).sort();

      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: ctx.t("automessage.title"),
          body: names.length > 0
            ? names
              .map((name) => {
                const entry = automessages[name];
                return ctx.t("automessage.list_line", {
                  name,
                  interval: formatDuration(entry.intervalMs / 1000),
                  channel_id: entry.channelId,
                });
              })
              .join("\n")
            : ctx.t("automessage.list_empty"),
        }),
        { ephemeral: true },
      );
    }
  },
};
