import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  buildSuggestionCard,
  getSuggestion,
  setSuggestionsChannel,
  SUGGESTION_STATUS,
  updateSuggestion,
} from "#services/suggestions.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Suggestions", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Suggestions", body });
}

function makeNumberOption(option) {
  return option.setName("number").setDescription("Suggestion number").setMinValue(1).setRequired(true);
}

function makeNoteOption(option) {
  return option.setName("note").setDescription("Optional staff note shown on the card").setMaxLength(200).setRequired(false);
}

async function refreshSuggestionMessage(guild, entry) {
  if (!entry.channelId || !entry.messageId) return false;
  const channel = guild.channels.cache.get(entry.channelId)
    ?? (await guild.channels.fetch(entry.channelId).catch(() => null));
  const message = await channel?.messages.fetch(entry.messageId).catch(() => null);
  if (!message) return false;

  // Keep the existing vote buttons (second row) as-is.
  const rows = message.components.slice(1);
  await message.edit({
    components: [buildSuggestionCard(entry), ...rows],
    allowedMentions: { parse: [] },
  }).catch(() => {});
  return true;
}

export default {
  category: "utility",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Manage server suggestions")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Set the suggestions channel (empty to disable)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Where suggestions are posted")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("approve")
        .setDescription("Approve a suggestion")
        .addIntegerOption(makeNumberOption)
        .addStringOption(makeNoteOption),
    )
    .addSubcommand((sub) =>
      sub
        .setName("deny")
        .setDescription("Deny a suggestion")
        .addIntegerOption(makeNumberOption)
        .addStringOption(makeNoteOption),
    )
    .addSubcommand((sub) =>
      sub
        .setName("consider")
        .setDescription("Mark a suggestion as under consideration")
        .addIntegerOption(makeNumberOption)
        .addStringOption(makeNoteOption),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for suggestion command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("channel");
      await setSuggestionsChannel(guildId, channel?.id ?? null);
      await replyCard(
        interaction,
        successCard(channel
          ? `Suggestions channel set to <#${channel.id}>. Members can now use \`/suggest\`.`
          : "Suggestions disabled."),
        { ephemeral: true },
      );
      return;
    }

    const statusByCommand = {
      approve: "approved",
      deny: "denied",
      consider: "considered",
    };
    const status = statusByCommand[subcommand];
    const number = interaction.options.getInteger("number", true);
    const note = interaction.options.getString("note")?.trim() || null;

    const existing = await getSuggestion(guildId, number);
    if (!existing) {
      await replyCard(interaction, errorCard(`Suggestion #${number} was not found.`), { ephemeral: true });
      return;
    }

    const entry = await updateSuggestion(guildId, number, (stored) => {
      stored.status = status;
      stored.note = note;
    });

    const refreshed = await refreshSuggestionMessage(guild, entry);
    const label = SUGGESTION_STATUS[status].label;

    await replyCard(
      interaction,
      successCard([
        `Suggestion **#${number}** marked as **${label}**.`,
        ...(note ? [`- Note: ${note}`] : []),
        ...(refreshed ? [] : ["- Note: the original card could not be updated (message missing?)."]),
      ].join("\n")),
      { ephemeral: true },
    );
  },
};
