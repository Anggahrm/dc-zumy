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
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Auto-messages", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Auto-messages", body });
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
        await replyCard(interaction, errorCard("Interval must be between **30m** and **7d** (e.g. `1h`, `12h`, `1d`)."), {
          ephemeral: true,
        });
        return;
      }

      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel?.isTextBased() || typeof channel.send !== "function" || channel.guildId !== guild.id) {
        await replyCard(interaction, errorCard("Pick a text channel in this server."), { ephemeral: true });
        return;
      }

      const result = await createAutomessage(guildId, interaction.options.getString("name", true), {
        channelId: channel.id,
        content: interaction.options.getString("content", true),
        intervalMs,
      });

      if (!result.ok) {
        const reasons = {
          invalid_name: "Names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
          exists: "An auto-message with that name already exists.",
          full: `Limit reached (max ${MAX_AUTOMESSAGES}).`,
        };
        await replyCard(interaction, errorCard(reasons[result.reason] ?? "Could not create it."), { ephemeral: true });
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
        successCard([
          `Auto-message \`${result.name}\` created.`,
          `- Channel: <#${channel.id}>`,
          `- Every: **${formatDuration(intervalMs / 1000)}** (first post in one interval)`,
        ].join("\n")),
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
        removed ? successCard("Auto-message deleted.") : errorCard("No auto-message with that name."),
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
          title: "Auto-messages",
          body: names.length > 0
            ? names
              .map((name) => {
                const entry = automessages[name];
                return `- \`${name}\` — every **${formatDuration(entry.intervalMs / 1000)}** in <#${entry.channelId}>`;
              })
              .join("\n")
            : "No auto-messages yet. Use `/automessage add`.",
        }),
        { ephemeral: true },
      );
    }
  },
};
