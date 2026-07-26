import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import {
  buildSuggestionCard,
  getSuggestion,
  setSuggestionsChannel,
  updateSuggestion,
} from "#services/suggestions.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("suggestion", {
  en: {
    title: "Suggestions",
    channel_set: "Suggestions channel set to <#{channel_id}>. Members can now use `/suggest`.",
    disabled: "Suggestions disabled.",
    not_found: "Suggestion #{number} was not found.",
    status_approved: "Approved",
    status_denied: "Denied",
    status_considered: "Under consideration",
    marked: "Suggestion **#{number}** marked as **{label}**.",
    note_line: "- Note: {note}",
    card_update_failed: "- Note: the original card could not be updated (message missing?).",
  },
  id: {
    title: "Saran",
    channel_set: "Channel saran diatur ke <#{channel_id}>. Member sekarang bisa pakai `/suggest`.",
    disabled: "Fitur saran dimatikan.",
    not_found: "Saran #{number} tidak ditemukan.",
    status_approved: "Disetujui",
    status_denied: "Ditolak",
    status_considered: "Dalam pertimbangan",
    marked: "Saran **#{number}** ditandai sebagai **{label}**.",
    note_line: "- Catatan: {note}",
    card_update_failed: "- Catatan: kartu aslinya tidak bisa diperbarui (pesannya hilang?).",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("suggestion.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("suggestion.title"), body });
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
        successCard(ctx.t, channel
          ? ctx.t("suggestion.channel_set", { channel_id: channel.id })
          : ctx.t("suggestion.disabled")),
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
      await replyCard(interaction, errorCard(ctx.t, ctx.t("suggestion.not_found", { number })), { ephemeral: true });
      return;
    }

    const entry = await updateSuggestion(guildId, number, (stored) => {
      stored.status = status;
      stored.note = note;
    });

    const refreshed = await refreshSuggestionMessage(guild, entry);
    const label = ctx.t(`suggestion.status_${status}`);

    await replyCard(
      interaction,
      successCard(ctx.t, [
        ctx.t("suggestion.marked", { number, label }),
        ...(note ? [ctx.t("suggestion.note_line", { note })] : []),
        ...(refreshed ? [] : [ctx.t("suggestion.card_update_failed")]),
      ].join("\n")),
      { ephemeral: true },
    );
  },
};
