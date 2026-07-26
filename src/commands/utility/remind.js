import { SlashCommandBuilder } from "discord.js";
import { cancelReminder, listReminders, MAX_REMINDER_LENGTH, MAX_REMINDERS_PER_USER } from "#services/reminders.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

const MAX_REMINDER_MS = 90 * 24 * 60 * 60 * 1000;

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Reminders", body });
}

export default {
  category: "utility",
  cooldown: 3,
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Personal reminders")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set a reminder")
        .addStringOption((option) =>
          option.setName("in").setDescription("When, e.g. 20m, 2h, 3d (max 90d)").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("text").setDescription("What to remind you about").setMaxLength(MAX_REMINDER_LENGTH).setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List your reminders"))
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Cancel a reminder")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Reminder id (see /remind list)").setMinValue(1).setRequired(true),
        ),
    ),
  async execute({ interaction }) {
    const scheduler = interaction.client.zumy?.scheduler;
    if (!scheduler) {
      throw new Error("Scheduler is not available.");
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "set") {
      const durationMs = parseDuration(interaction.options.getString("in", true));
      const text = interaction.options.getString("text", true).trim();

      if (!durationMs || durationMs < 60_000 || durationMs > MAX_REMINDER_MS) {
        await replyCard(interaction, errorCard("Time must be between **1m** and **90d** (e.g. `20m`, `2h`, `3d`)."), {
          ephemeral: true,
        });
        return;
      }

      const existing = await listReminders(interaction.user.id);
      if (existing.length >= MAX_REMINDERS_PER_USER) {
        await replyCard(
          interaction,
          errorCard(`You already have ${MAX_REMINDERS_PER_USER} reminders. Cancel one with \`/remind cancel\`.`),
          { ephemeral: true },
        );
        return;
      }

      const runAt = new Date(Date.now() + durationMs);
      await scheduler.schedule({
        type: "reminder",
        runAt,
        guildId: interaction.guildId ?? null,
        payload: {
          userId: interaction.user.id,
          channelId: interaction.guildId ? interaction.channelId : null,
          text,
        },
      });

      const unix = Math.floor(runAt.getTime() / 1000);
      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: "Reminders",
          body: [
            `⏰ I'll remind you in **${formatDuration(durationMs / 1000)}** (<t:${unix}:F>).`,
            `- ${text}`,
            interaction.guildId ? "-# Delivered in this channel (DM fallback)." : "-# Delivered via DM.",
          ].join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const reminders = await listReminders(interaction.user.id);
      if (reminders.length === 0) {
        await replyCard(
          interaction,
          createCard({ color: 0x3498db, title: "Reminders", body: "No reminders set. Use `/remind set`." }),
          { ephemeral: true },
        );
        return;
      }

      const lines = reminders.map((job) => {
        const unix = Math.floor(new Date(job.runAt).getTime() / 1000);
        return `**#${job.id}** <t:${unix}:R> — ${String(job.payload?.text ?? "").slice(0, 80)}`;
      });

      await replyCard(
        interaction,
        createCard({ color: 0x3498db, title: "Your reminders", body: lines.join("\n") }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "cancel") {
      const id = interaction.options.getInteger("id", true);
      const cancelled = await cancelReminder(interaction.user.id, id);
      await replyCard(
        interaction,
        cancelled
          ? createCard({ color: 0x57f287, title: "Reminders", body: `Reminder **#${id}** cancelled.` })
          : errorCard("No reminder with that id (it may have already fired)."),
        { ephemeral: true },
      );
    }
  },
};
