import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  createTrigger,
  deleteTrigger,
  getTriggers,
  MAX_MATCH_LENGTH,
  MAX_RESPONSE_LENGTH,
  MAX_TRIGGERS,
  toggleTriggerChannel,
  TRIGGER_TYPES,
} from "#services/triggers.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Triggers", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Triggers", body });
}

export default {
  category: "utility",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("trigger")
    .setDescription("Auto-respond to chat messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Create an autoresponder")
        .addStringOption((option) =>
          option.setName("name").setDescription("Trigger name (lowercase, no spaces)").setMaxLength(32).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("match").setDescription("Text to match").setMaxLength(MAX_MATCH_LENGTH).setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription("Reply ({user} {username} {server})")
            .setMaxLength(MAX_RESPONSE_LENGTH)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("How to match (default: contains)")
            .addChoices(...TRIGGER_TYPES.map((type) => ({ name: type, value: type })))
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("chance").setDescription("Reply chance % (default 100)").setMinValue(1).setMaxValue(100).setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("cooldown").setDescription("Seconds between replies (default 30)").setMinValue(0).setMaxValue(3600).setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Restrict to one channel (add more via /trigger channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete an autoresponder")
        .addStringOption((option) =>
          option.setName("name").setDescription("Trigger name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Toggle a channel restriction on a trigger")
        .addStringOption((option) =>
          option.setName("name").setDescription("Trigger name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to toggle")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List autoresponders")),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const triggers = await getTriggers(interaction.guildId, { preferCache: true });
    await interaction.respond(
      Object.keys(triggers)
        .filter((name) => !query || name.includes(query))
        .sort()
        .slice(0, 25)
        .map((name) => ({ name, value: name })),
    );
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for trigger command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const result = await createTrigger(guildId, interaction.options.getString("name", true), {
        match: interaction.options.getString("match", true),
        response: interaction.options.getString("response", true),
        type: interaction.options.getString("type") ?? "contains",
        chance: interaction.options.getInteger("chance"),
        cooldownSeconds: interaction.options.getInteger("cooldown"),
        channelId: interaction.options.getChannel("channel")?.id ?? null,
      });

      if (!result.ok) {
        const reasons = {
          invalid_name: "Trigger names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
          exists: "A trigger with that name already exists.",
          full: `Trigger limit reached (max ${MAX_TRIGGERS}).`,
          empty: "Match and response cannot be empty.",
        };
        await replyCard(interaction, errorCard(reasons[result.reason] ?? "Could not create the trigger."), {
          ephemeral: true,
        });
        return;
      }

      await replyCard(interaction, successCard(`Trigger \`${result.name}\` created.`), { ephemeral: true });
      return;
    }

    if (subcommand === "remove") {
      const removed = await deleteTrigger(guildId, interaction.options.getString("name", true));
      await replyCard(
        interaction,
        removed ? successCard("Trigger deleted.") : errorCard("No trigger with that name."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("channel", true);
      const result = await toggleTriggerChannel(guildId, interaction.options.getString("name", true), channel.id);

      if (!result) {
        await replyCard(interaction, errorCard("No trigger with that name."), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        successCard(
          result.restricted
            ? `Trigger now also fires in <#${channel.id}>${result.channels.length === 1 ? " (and only there)" : ""}.`
            : result.channels.length === 0
              ? "Channel restriction removed — trigger now fires everywhere."
              : `Trigger no longer fires in <#${channel.id}>.`,
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const triggers = await getTriggers(guildId);
      const names = Object.keys(triggers).sort();

      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Triggers",
          body: names.length > 0
            ? names
              .map((name) => {
                const trigger = triggers[name];
                const scope = trigger.channels.length > 0
                  ? trigger.channels.map((id) => `<#${id}>`).join(", ")
                  : "all channels";
                return `- \`${name}\` — ${trigger.type} \`${trigger.match.replaceAll("`", "'")}\` (${trigger.chance}%, ${trigger.cooldownSeconds}s cd, ${scope})`;
              })
              .join("\n")
            : "No triggers yet. Create one with `/trigger add`.",
        }),
        { ephemeral: true },
      );
    }
  },
};
