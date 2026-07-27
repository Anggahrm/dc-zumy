import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { registerStrings } from "#services/i18n.js";
import {
  buildSuggestionCard,
  createSuggestion,
  getSuggestionsConfig,
  MAX_SUGGESTION_LENGTH,
  updateSuggestion,
  voteSuggestion,
} from "#services/suggestions.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";

registerStrings("suggest", {
  en: {
    title: "Suggestions",
    guild_only: "Suggestions only work in a server.",
    vote_invalid: "This vote button doesn't work anymore.",
    not_found: "This suggestion no longer exists.",
    not_set_up: "Suggestions are not set up here. An admin can enable them with `/suggestion channel`.",
    channel_unavailable: "The suggestions channel is unavailable. Ask an admin to re-run `/suggestion channel`.",
    empty: "Your suggestion can't be empty — write something first.",
    post_failed: "I couldn't post to the suggestions channel. Check my permissions there.",
    posted: "Suggestion **#{number}** posted in <#{channel_id}>. Thanks!",
  },
  id: {
    title: "Saran",
    guild_only: "Saran hanya bisa dipakai di server.",
    vote_invalid: "Tombol vote ini sudah tidak berfungsi.",
    not_found: "Saran ini sudah tidak ada.",
    not_set_up: "Fitur saran belum diatur di sini. Admin bisa mengaktifkannya lewat `/suggestion channel`.",
    channel_unavailable: "Channel saran tidak bisa diakses. Minta admin menjalankan ulang `/suggestion channel`.",
    empty: "Saranmu tidak boleh kosong — tulis sesuatu dulu ya.",
    post_failed: "Aku tidak bisa posting ke channel saran. Cek permission-ku di sana ya.",
    posted: "Saran **#{number}** sudah diposting di <#{channel_id}>. Makasih!",
  },
});

const VOTE_PREFIX = "suggest-vote:";

function voteRow(number) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${VOTE_PREFIX}${number}:up`)
      .setEmoji("👍")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${VOTE_PREFIX}${number}:down`)
      .setEmoji("👎")
      .setStyle(ButtonStyle.Secondary),
  );
}

export default {
  category: "community",
  cooldown: 30,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion for this server")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("suggestion")
        .setDescription("Your suggestion")
        .setMaxLength(MAX_SUGGESTION_LENGTH)
        .setRequired(true),
    ),
  async onComponent({ interaction, t }) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith(VOTE_PREFIX)) return false;

    const guild = interaction.guild;
    if (!guild) {
      await replyError(interaction, t("suggest.guild_only"));
      return true;
    }

    const [, numberRaw, direction] = interaction.customId.split(":");
    const number = Number(numberRaw);
    if (!Number.isInteger(number) || !["up", "down"].includes(direction)) {
      await replyError(interaction, t("suggest.vote_invalid"));
      return true;
    }

    const entry = await voteSuggestion(guild.id, number, interaction.user.id, direction);
    if (!entry) {
      await replyError(interaction, t("suggest.not_found"));
      return true;
    }

    await interaction.update({
      components: [buildSuggestionCard(entry), voteRow(number)],
      allowedMentions: { parse: [] },
    });
    return true;
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for suggest command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const { channelId } = await getSuggestionsConfig(guildId);
    if (!channelId) {
      await replyCard(
        interaction,
        createCard({
          color: 0xf1c40f,
          title: ctx.t("suggest.title"),
          body: ctx.t("suggest.not_set_up"),
        }),
        { ephemeral: true },
      );
      return;
    }

    const channel = guild.channels.cache.get(channelId)
      ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
      await replyCard(
        interaction,
        createCard({
          color: 0xed4245,
          title: ctx.t("suggest.title"),
          body: ctx.t("suggest.channel_unavailable"),
        }),
        { ephemeral: true },
      );
      return;
    }

    const text = interaction.options.getString("suggestion", true).trim();
    if (!text) {
      await replyCard(
        interaction,
        createCard({ color: 0xed4245, title: ctx.t("suggest.title"), body: ctx.t("suggest.empty") }),
        { ephemeral: true },
      );
      return;
    }

    const created = await createSuggestion(guildId, { authorId: interaction.user.id, text });
    if (!created) {
      throw new Error("Failed to create suggestion.");
    }

    const entry = {
      number: created.number,
      authorId: interaction.user.id,
      text,
      status: "pending",
      note: null,
      up: [],
      down: [],
    };

    let message;
    try {
      message = await channel.send({
        components: [buildSuggestionCard(entry), voteRow(created.number)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    } catch {
      await replyCard(
        interaction,
        createCard({
          color: 0xed4245,
          title: ctx.t("suggest.title"),
          body: ctx.t("suggest.post_failed"),
        }),
        { ephemeral: true },
      );
      return;
    }

    await updateSuggestion(guildId, created.number, (stored) => {
      stored.messageId = message.id;
    });

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: ctx.t("suggest.title"),
        body: ctx.t("suggest.posted", { number: created.number, channel_id: channelId }),
      }),
      { ephemeral: true },
    );
  },
};
