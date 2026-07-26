import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("purge", {
  en: {
    title: "Moderation",
    complete_title: "**Purge Complete**",
    mode_line: "- Mode: **{mode}**",
    requested_line: "- Requested: **{requested}** message(s)",
    deleted_line: "- Deleted: **{deleted}** message(s)",
    filter_line: "- Filter: {detail}",
    no_match: "No messages matched for **{mode}** in the latest {limit} messages.",
    filter_line_plain: "Filter: {detail}",
    need_manage_messages: "I need **Manage Messages** permission to purge in this channel.",
    cannot_access_channel: "I can't access this channel to purge messages.",
    empty_substring: "Please provide a non-empty substring filter.",
    bulk_delete_unsupported: "This channel doesn't support bulk message deletion.",
    detail_prefix: "prefix starts with `{value}`",
    detail_contains: "contains `{value}`",
    detail_member: "member **{user}**",
  },
  id: {
    title: "Moderasi",
    complete_title: "**Purge Selesai**",
    mode_line: "- Mode: **{mode}**",
    requested_line: "- Diminta: **{requested}** pesan",
    deleted_line: "- Dihapus: **{deleted}** pesan",
    filter_line: "- Filter: {detail}",
    no_match: "Tidak ada pesan yang cocok untuk **{mode}** di {limit} pesan terakhir.",
    filter_line_plain: "Filter: {detail}",
    need_manage_messages: "Aku butuh permission **Manage Messages** untuk purge di channel ini.",
    cannot_access_channel: "Aku tidak bisa mengakses channel ini untuk purge pesan.",
    empty_substring: "Filter substring-nya tidak boleh kosong ya.",
    bulk_delete_unsupported: "Channel ini tidak mendukung penghapusan pesan massal.",
    detail_prefix: "prefix diawali `{value}`",
    detail_contains: "mengandung `{value}`",
    detail_member: "member **{user}**",
  },
});

const DEFAULT_LIMIT = 50;
const MAX_FETCH_LIMIT = 100;

class PurgeUserError extends Error {
  constructor(message) {
    super(message);
    this.exposeToUser = true;
  }
}

function makeCountOption(option, required = true) {
  return option
    .setName("count")
    .setDescription("How many messages to purge (1-100)")
    .setMinValue(1)
    .setMaxValue(100)
    .setRequired(required);
}

function parsePrefix(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseSubstring(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function formatFilterValue(value) {
  return value.replaceAll("`", "'").slice(0, 80);
}

function hasEmoji(content) {
  if (!content) return false;
  return /<a?:\w+:\d+>|\p{Extended_Pictographic}/u.test(content);
}

function hasLink(content) {
  if (!content) return false;
  return /https?:\/\//i.test(content);
}

function hasMention(message) {
  if (message.mentions?.users?.size > 0) return true;
  if (message.mentions?.roles?.size > 0) return true;
  if (message.mentions?.everyone) return true;
  return false;
}

async function fetchRecentMessages(channel) {
  return channel.messages.fetch({ limit: MAX_FETCH_LIMIT });
}

function pickMessages(messages, predicate, count) {
  return messages
    .filter(predicate)
    .first(count);
}

function buildResultCard(t, { modeLabel, requested, deleted, detail = null }) {
  const lines = [
    t("purge.complete_title"),
    t("purge.mode_line", { mode: modeLabel }),
    t("purge.requested_line", { requested }),
    t("purge.deleted_line", { deleted }),
  ];

  if (detail) {
    lines.push(t("purge.filter_line", { detail }));
  }

  return createCard({
    color: 0xf1c40f,
    title: t("purge.title"),
    body: lines.join("\n"),
  });
}

function buildEmptyCard(t, modeLabel, detail = null) {
  const lines = [
    t("purge.no_match", { mode: modeLabel, limit: MAX_FETCH_LIMIT }),
  ];

  if (detail) {
    lines.push(t("purge.filter_line_plain", { detail }));
  }

  return createCard({
    color: 0xf1c40f,
    title: t("purge.title"),
    body: lines.join("\n"),
  });
}

function buildErrorCard(t, message) {
  return createCard({
    color: 0xed4245,
    title: t("purge.title"),
    body: message,
  });
}

function toPurgeUserError(error, t) {
  if (error?.exposeToUser) {
    return error;
  }

  if (error?.code === 50013) {
    return new PurgeUserError(t("purge.need_manage_messages"));
  }

  if (error?.code === 50001) {
    return new PurgeUserError(t("purge.cannot_access_channel"));
  }

  return error;
}

async function executeFilteredPurge({ interaction, t, modeLabel, count, detail, predicate }) {
  const fetched = await fetchRecentMessages(interaction.channel);
  const targets = pickMessages(fetched, predicate, count);

  if (targets.length === 0) {
    await replyCard(interaction, buildEmptyCard(t, modeLabel, detail), { ephemeral: true });
    return;
  }

  const deleted = await interaction.channel.bulkDelete(targets, true);
  await replyCard(
    interaction,
    buildResultCard(t, {
      modeLabel,
      requested: count,
      deleted: deleted.size,
      detail,
    }),
    { ephemeral: true },
  );
}

function ensureBulkDeleteChannel(interaction, t) {
  if (!interaction.channel || typeof interaction.channel.bulkDelete !== "function") {
    throw new PurgeUserError(t("purge.bulk_delete_unsupported"));
  }
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageMessages],
  },
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Purge recent messages with filters")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("all")
        .setDescription("Purge recent messages")
        .addIntegerOption((option) => makeCountOption(option, true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("bot")
        .setDescription("Purge bot messages")
        .addIntegerOption((option) => makeCountOption(option, true))
        .addStringOption((option) =>
          option
            .setName("prefix")
            .setDescription("Only bot messages starting with this prefix")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("contains")
        .setDescription("Purge messages that contain a substring")
        .addStringOption((option) =>
          option
            .setName("substring")
            .setDescription("Text to search for")
            .setRequired(true),
        )
        .addIntegerOption((option) => makeCountOption(option, false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("embeds")
        .setDescription("Purge messages containing embeds")
        .addIntegerOption((option) => makeCountOption(option, true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("emoji")
        .setDescription("Purge messages containing emoji")
        .addIntegerOption((option) => makeCountOption(option, true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("files")
        .setDescription("Purge messages containing file attachments")
        .addIntegerOption((option) => makeCountOption(option, true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("human")
        .setDescription("Purge messages from non-bot users")
        .addIntegerOption((option) => makeCountOption(option, true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("images")
        .setDescription("Purge messages containing images")
        .addIntegerOption((option) => makeCountOption(option, true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("link")
        .setDescription("Purge messages containing links")
        .addIntegerOption((option) => makeCountOption(option, true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("mentions")
        .setDescription("Purge messages containing mentions")
        .addIntegerOption((option) => makeCountOption(option, true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reactions")
        .setDescription("Purge messages with reactions")
        .addIntegerOption((option) => makeCountOption(option, true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("Purge messages from a specific user")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member whose messages should be purged")
            .setRequired(true),
        )
        .addIntegerOption((option) => makeCountOption(option, false)),
    ),
  async execute({ interaction, ctx }) {
    const t = ctx.t;
    ensureBulkDeleteChannel(interaction, t);
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });

    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "all") {
        const count = interaction.options.getInteger("count", true);
        const deleted = await interaction.channel.bulkDelete(count, true);
        await replyCard(
          interaction,
          buildResultCard(t, {
            modeLabel: "all",
            requested: count,
            deleted: deleted.size,
          }),
          { ephemeral: true },
        );
        return;
      }

      if (subcommand === "bot") {
        const count = interaction.options.getInteger("count", true);
        const prefix = parsePrefix(interaction.options.getString("prefix"));

        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "bot",
          count,
          detail: prefix ? t("purge.detail_prefix", { value: formatFilterValue(prefix) }) : null,
          predicate: (message) => {
            if (!message.author?.bot) return false;
            if (!prefix) return true;
            return message.content?.startsWith(prefix) ?? false;
          },
        });
        return;
      }

      if (subcommand === "contains") {
        const substringRaw = interaction.options.getString("substring", true);
        const substring = parseSubstring(substringRaw);
        if (!substring) {
          throw new PurgeUserError(t("purge.empty_substring"));
        }

        const count = interaction.options.getInteger("count") ?? DEFAULT_LIMIT;
        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "contains",
          count,
          detail: t("purge.detail_contains", { value: formatFilterValue(substringRaw) }),
          predicate: (message) => {
            const content = message.content?.toLowerCase();
            return Boolean(content && content.includes(substring));
          },
        });
        return;
      }

      if (subcommand === "embeds") {
        const count = interaction.options.getInteger("count", true);
        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "embeds",
          count,
          predicate: (message) => (message.embeds?.length ?? 0) > 0,
        });
        return;
      }

      if (subcommand === "emoji") {
        const count = interaction.options.getInteger("count", true);
        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "emoji",
          count,
          predicate: (message) => hasEmoji(message.content),
        });
        return;
      }

      if (subcommand === "files") {
        const count = interaction.options.getInteger("count", true);
        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "files",
          count,
          predicate: (message) => (message.attachments?.size ?? 0) > 0,
        });
        return;
      }

      if (subcommand === "human") {
        const count = interaction.options.getInteger("count", true);
        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "human",
          count,
          predicate: (message) => !message.author?.bot,
        });
        return;
      }

      if (subcommand === "images") {
        const count = interaction.options.getInteger("count", true);
        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "images",
          count,
          predicate: (message) => {
            if ((message.attachments?.size ?? 0) === 0) return false;
            return message.attachments.some((attachment) => attachment.contentType?.startsWith("image/"));
          },
        });
        return;
      }

      if (subcommand === "link") {
        const count = interaction.options.getInteger("count", true);
        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "link",
          count,
          predicate: (message) => hasLink(message.content),
        });
        return;
      }

      if (subcommand === "mentions") {
        const count = interaction.options.getInteger("count", true);
        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "mentions",
          count,
          predicate: (message) => hasMention(message),
        });
        return;
      }

      if (subcommand === "reactions") {
        const count = interaction.options.getInteger("count", true);
        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "reactions",
          count,
          predicate: (message) => (message.reactions?.cache?.size ?? 0) > 0,
        });
        return;
      }

      if (subcommand === "user") {
        const member = interaction.options.getUser("member", true);
        const count = interaction.options.getInteger("count") ?? DEFAULT_LIMIT;

        await executeFilteredPurge({
          interaction,
          t,
          modeLabel: "user",
          count,
          detail: t("purge.detail_member", { user: member.tag }),
          predicate: (message) => message.author?.id === member.id,
        });
      }
    } catch (error) {
      throw toPurgeUserError(error, t);
    }
  },
};
