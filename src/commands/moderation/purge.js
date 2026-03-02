import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

const DEFAULT_LIMIT = 50;
const MAX_FETCH_LIMIT = 100;

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

function hasEmoji(content) {
  if (!content) return false;
  return /<a?:\w+:\d+>|[\u{1F300}-\u{1FAFF}]/u.test(content);
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

function buildResultCard({ modeLabel, requested, deleted, detail = null }) {
  const lines = [
    "**Purge Complete**",
    `- Mode: **${modeLabel}**`,
    `- Requested: **${requested}** message(s)`,
    `- Deleted: **${deleted}** message(s)`,
  ];

  if (detail) {
    lines.push(`- Filter: ${detail}`);
  }

  return createCard({
    color: 0xf1c40f,
    title: "Moderation",
    body: lines.join("\n"),
  });
}

function buildEmptyCard(modeLabel, detail = null) {
  const lines = [
    `No messages matched for **${modeLabel}** in the latest ${MAX_FETCH_LIMIT} messages.`,
  ];

  if (detail) {
    lines.push(`Filter: ${detail}`);
  }

  return createCard({
    color: 0xf1c40f,
    title: "Moderation",
    body: lines.join("\n"),
  });
}

function buildErrorCard(message) {
  return createCard({
    color: 0xed4245,
    title: "Moderation",
    body: message,
  });
}

async function executeFilteredPurge({ interaction, modeLabel, count, detail, predicate }) {
  const fetched = await fetchRecentMessages(interaction.channel);
  const targets = pickMessages(fetched, predicate, count);

  if (targets.length === 0) {
    await replyCard(interaction, buildEmptyCard(modeLabel, detail), { ephemeral: true });
    return;
  }

  const deleted = await interaction.channel.bulkDelete(targets, true);
  await replyCard(
    interaction,
    buildResultCard({
      modeLabel,
      requested: count,
      deleted: deleted.size,
      detail,
    }),
    { ephemeral: true },
  );
}

function ensureBulkDeleteChannel(interaction) {
  if (!interaction.channel || typeof interaction.channel.bulkDelete !== "function") {
    throw new Error("Can't bulk delete in this channel.");
  }
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    admin: true,
  },
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Purge recent messages with filters")
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
  async execute({ interaction }) {
    ensureBulkDeleteChannel(interaction);

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "all") {
      const count = interaction.options.getInteger("count", true);
      const deleted = await interaction.channel.bulkDelete(count, true);
      await replyCard(
        interaction,
        buildResultCard({
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
        modeLabel: "bot",
        count,
        detail: prefix ? `prefix starts with \`${prefix}\`` : null,
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
        await replyCard(interaction, buildErrorCard("Please provide a non-empty substring filter."), {
          ephemeral: true,
        });
        return;
      }

      const count = interaction.options.getInteger("count") ?? DEFAULT_LIMIT;
      await executeFilteredPurge({
        interaction,
        modeLabel: "contains",
        count,
        detail: `contains \`${substringRaw}\``,
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
        modeLabel: "user",
        count,
        detail: `member **${member.tag}**`,
        predicate: (message) => message.author?.id === member.id,
      });
    }
  },
};
