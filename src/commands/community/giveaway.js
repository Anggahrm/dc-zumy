import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  buildEntryRow,
  buildGiveawayCard,
  createGiveaway,
  ENTER_PREFIX,
  finishGiveaway,
  listGiveaways,
  setGiveawayMessage,
  toggleEntrant,
} from "#services/giveaways.js";
import { registerStrings } from "#services/i18n.js";
import { giveawayJobKey } from "#services/scheduler-jobs.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

registerStrings("giveaway", {
  en: {
    title: "Giveaway",
    entry_ended: "This giveaway has already ended.",
    entered: "You're in! Good luck 🎉",
    left: "You left the giveaway.",
    duration_invalid: "Duration must be between **1m** and **30d** (e.g. `1h`, `1d`).",
    pick_text_channel: "Pick a text channel I can post in.",
    post_failed: "I couldn't post in that channel. Check my permissions.",
    started: "Giveaway **#{id}** started in <#{channel_id}>!\n- Prize: **{prize}**\n- Winners: **{winners}**\n- Ends: {duration} from now",
    reason_not_found: "Giveaway #{id} was not found in this server.",
    reason_already_ended: "Giveaway #{id} has already ended. Use `/giveaway reroll` instead.",
    reason_not_ended: "Giveaway #{id} is still running. Use `/giveaway end` first.",
    process_failed: "Could not process that giveaway.",
    ended_winners: "Giveaway **#{id}** ended — winner(s): {winners}",
    rerolled_winners: "Giveaway **#{id}** rerolled — winner(s): {winners}",
    ended_no_entries: "Giveaway **#{id}** ended with no entries.",
    rerolled_no_entries: "Giveaway **#{id}** rerolled with no entries.",
    list_empty: "No giveaways yet. Start one with `/giveaway start`.",
    list_line_running: "**#{id}** 🟢 {prize} — {entrants} entries, ends <t:{timestamp}:R>",
    list_line_ended: "**#{id}** 🔚 {prize} — {entrants} entries, ended <t:{timestamp}:R>",
    list_title: "Giveaways",
  },
  id: {
    title: "Giveaway",
    entry_ended: "Giveaway ini sudah berakhir.",
    entered: "Kamu ikut! Semoga beruntung 🎉",
    left: "Kamu keluar dari giveaway ini.",
    duration_invalid: "Durasi harus antara **1m** dan **30d** (contoh: `1h`, `1d`).",
    pick_text_channel: "Pilih text channel yang bisa aku pakai untuk posting.",
    post_failed: "Aku tidak bisa posting di channel itu. Cek permission-ku ya.",
    started: "Giveaway **#{id}** dimulai di <#{channel_id}>!\n- Hadiah: **{prize}**\n- Pemenang: **{winners}**\n- Berakhir: {duration} dari sekarang",
    reason_not_found: "Giveaway #{id} tidak ditemukan di server ini.",
    reason_already_ended: "Giveaway #{id} sudah berakhir. Pakai `/giveaway reroll` saja.",
    reason_not_ended: "Giveaway #{id} masih berjalan. Pakai `/giveaway end` dulu.",
    process_failed: "Tidak bisa memproses giveaway itu.",
    ended_winners: "Giveaway **#{id}** berakhir — pemenang: {winners}",
    rerolled_winners: "Giveaway **#{id}** di-reroll — pemenang: {winners}",
    ended_no_entries: "Giveaway **#{id}** berakhir tanpa peserta.",
    rerolled_no_entries: "Giveaway **#{id}** di-reroll tanpa peserta.",
    list_empty: "Belum ada giveaway. Mulai satu dengan `/giveaway start`.",
    list_line_running: "**#{id}** 🟢 {prize} — {entrants} peserta, berakhir <t:{timestamp}:R>",
    list_line_ended: "**#{id}** 🔚 {prize} — {entrants} peserta, sudah berakhir <t:{timestamp}:R>",
    list_title: "Giveaway",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("giveaway.title"), body });
}

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("giveaway.title"), body });
}

export default {
  category: "community",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Run giveaways with button entry")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a giveaway")
        .addStringOption((option) =>
          option.setName("prize").setDescription("What can be won").setMaxLength(200).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("duration").setDescription("e.g. 1h, 1d, 7d (max 30d)").setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setMaxValue(20).setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Where to post (defaults to current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("End a giveaway early")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Giveaway id (see /giveaway list)").setMinValue(1).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reroll")
        .setDescription("Reroll winners for an ended giveaway")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Giveaway id").setMinValue(1).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List recent giveaways"),
    ),
  async onComponent({ interaction, t }) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith(ENTER_PREFIX)) return false;

    const id = Number(interaction.customId.slice(ENTER_PREFIX.length));
    if (!Number.isInteger(id)) return false;

    const result = await toggleEntrant(id, interaction.user.id);
    if (!result) {
      await replyError(interaction, t("giveaway.entry_ended"));
      return true;
    }

    await interaction.update({
      components: [buildGiveawayCard(result.row), buildEntryRow(id)],
      allowedMentions: { parse: [] },
    });

    await interaction.followUp({
      components: [
        createCard({
          color: result.entered ? 0x57f287 : 0xf1c40f,
          title: t("giveaway.title"),
          body: result.entered ? t("giveaway.entered") : t("giveaway.left"),
        }),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for giveaway command.");
    }

    const scheduler = interaction.client.zumy?.scheduler;
    if (!scheduler) {
      throw new Error("Scheduler is not available.");
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "start") {
      const prize = interaction.options.getString("prize", true).trim();
      const durationMs = parseDuration(interaction.options.getString("duration", true));
      const winners = interaction.options.getInteger("winners") ?? 1;
      const channel = interaction.options.getChannel("channel") ?? interaction.channel;

      if (!durationMs || durationMs < 60_000 || durationMs > MAX_DURATION_MS) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("giveaway.duration_invalid")), {
          ephemeral: true,
        });
        return;
      }

      if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("giveaway.pick_text_channel")), { ephemeral: true });
        return;
      }

      const endsAt = new Date(Date.now() + durationMs);
      const row = await createGiveaway({
        guildId: guild.id,
        channelId: channel.id,
        prize,
        winnerCount: winners,
        endsAt,
        createdBy: interaction.user.id,
      });

      let message;
      try {
        message = await channel.send({
          components: [buildGiveawayCard(row), buildEntryRow(row.id)],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] },
        });
      } catch {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("giveaway.post_failed")), {
          ephemeral: true,
        });
        return;
      }

      await setGiveawayMessage(row.id, message.id);
      await scheduler.schedule({
        type: "giveaway_end",
        runAt: endsAt,
        guildId: guild.id,
        payload: { giveawayId: row.id },
        dedupeKey: giveawayJobKey(row.id),
      });

      await replyCard(
        interaction,
        successCard(ctx.t, ctx.t("giveaway.started", {
          id: row.id,
          channel_id: channel.id,
          prize,
          winners,
          duration: formatDuration(durationMs / 1000),
        })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "end" || subcommand === "reroll") {
      const id = interaction.options.getInteger("id", true);
      const reroll = subcommand === "reroll";
      const result = await finishGiveaway({
        guild,
        giveawayId: id,
        logger: interaction.client.zumy?.logger,
        reroll,
      });

      if (!result.ok) {
        const reasons = {
          not_found: ctx.t("giveaway.reason_not_found", { id }),
          already_ended: ctx.t("giveaway.reason_already_ended", { id }),
          not_ended: ctx.t("giveaway.reason_not_ended", { id }),
        };
        await replyCard(interaction, errorCard(ctx.t, reasons[result.reason] ?? ctx.t("giveaway.process_failed")), {
          ephemeral: true,
        });
        return;
      }

      if (!reroll) {
        await scheduler.cancelByKey(giveawayJobKey(id)).catch(() => {});
      }

      await replyCard(
        interaction,
        successCard(
          ctx.t,
          result.winners.length > 0
            ? ctx.t(reroll ? "giveaway.rerolled_winners" : "giveaway.ended_winners", {
              id,
              winners: result.winners.map((w) => `<@${w}>`).join(", "),
            })
            : ctx.t(reroll ? "giveaway.rerolled_no_entries" : "giveaway.ended_no_entries", { id }),
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const rows = await listGiveaways(guild.id, { limit: 10 });
      if (rows.length === 0) {
        await replyCard(interaction, successCard(ctx.t, ctx.t("giveaway.list_empty")), {
          ephemeral: true,
        });
        return;
      }

      const lines = rows.map((row) => {
        const endsAtUnix = Math.floor(new Date(row.endsAt).getTime() / 1000);
        const entrants = Array.isArray(row.entrants) ? row.entrants.length : 0;
        return ctx.t(row.ended ? "giveaway.list_line_ended" : "giveaway.list_line_running", {
          id: row.id,
          prize: row.prize,
          entrants,
          timestamp: endsAtUnix,
        });
      });

      await replyCard(
        interaction,
        createCard({ color: 0x3498db, title: ctx.t("giveaway.list_title"), body: lines.join("\n") }),
        { ephemeral: true },
      );
    }
  },
};
