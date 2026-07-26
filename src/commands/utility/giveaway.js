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
import { giveawayJobKey } from "#services/scheduler-jobs.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Giveaway", body });
}

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Giveaway", body });
}

export default {
  category: "utility",
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
  async onComponent({ interaction }) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith(ENTER_PREFIX)) return false;

    const id = Number(interaction.customId.slice(ENTER_PREFIX.length));
    if (!Number.isInteger(id)) return false;

    const result = await toggleEntrant(id, interaction.user.id);
    if (!result) {
      await replyError(interaction, "This giveaway has already ended.");
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
          title: "Giveaway",
          body: result.entered ? "You're in! Good luck 🎉" : "You left the giveaway.",
        }),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  },
  async execute({ interaction }) {
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
        await replyCard(interaction, errorCard("Duration must be between **1m** and **30d** (e.g. `1h`, `1d`)."), {
          ephemeral: true,
        });
        return;
      }

      if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
        await replyCard(interaction, errorCard("Pick a text channel I can post in."), { ephemeral: true });
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
        await replyCard(interaction, errorCard("I couldn't post in that channel. Check my permissions."), {
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
        successCard([
          `Giveaway **#${row.id}** started in <#${channel.id}>!`,
          `- Prize: **${prize}**`,
          `- Winners: **${winners}**`,
          `- Ends: ${formatDuration(durationMs / 1000)} from now`,
        ].join("\n")),
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
          not_found: `Giveaway #${id} was not found in this server.`,
          already_ended: `Giveaway #${id} has already ended. Use \`/giveaway reroll\` instead.`,
          not_ended: `Giveaway #${id} is still running. Use \`/giveaway end\` first.`,
        };
        await replyCard(interaction, errorCard(reasons[result.reason] ?? "Could not process that giveaway."), {
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
          result.winners.length > 0
            ? `Giveaway **#${id}** ${reroll ? "rerolled" : "ended"} — winner(s): ${result.winners.map((w) => `<@${w}>`).join(", ")}`
            : `Giveaway **#${id}** ${reroll ? "rerolled" : "ended"} with no entries.`,
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const rows = await listGiveaways(guild.id, { limit: 10 });
      if (rows.length === 0) {
        await replyCard(interaction, successCard("No giveaways yet. Start one with `/giveaway start`."), {
          ephemeral: true,
        });
        return;
      }

      const lines = rows.map((row) => {
        const endsAtUnix = Math.floor(new Date(row.endsAt).getTime() / 1000);
        const entrants = Array.isArray(row.entrants) ? row.entrants.length : 0;
        return `**#${row.id}** ${row.ended ? "🔚" : "🟢"} ${row.prize} — ${entrants} entries, ${row.ended ? `ended <t:${endsAtUnix}:R>` : `ends <t:${endsAtUnix}:R>`}`;
      });

      await replyCard(
        interaction,
        createCard({ color: 0x3498db, title: "Giveaways", body: lines.join("\n") }),
        { ephemeral: true },
      );
    }
  },
};
