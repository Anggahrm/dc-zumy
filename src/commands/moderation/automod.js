import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  addBannedWord,
  getAutomodConfig,
  MAX_BANNED_WORDS,
  MAX_MENTION_LIMIT,
  removeBannedWord,
  setAntiInvite,
  setMentionLimit,
} from "#services/automod.js";
import { createCard, replyCard } from "#utils/respond.js";

function statusLine(label, enabled, detail = null) {
  return `${enabled ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`;
}

function configCard(config) {
  const words = config.bannedWords.length > 0
    ? config.bannedWords.map((word) => `\`${word}\``).join(", ")
    : "(none)";

  return createCard({
    color: 0x3498db,
    title: "Automod",
    body: [
      "**Current settings**",
      statusLine("Anti-invite", config.antiInvite),
      statusLine(
        "Mention spam filter",
        config.mentionLimit > 0,
        config.mentionLimit > 0 ? `limit ${config.mentionLimit}` : null,
      ),
      statusLine("Banned words", config.bannedWords.length > 0, `${config.bannedWords.length}/${MAX_BANNED_WORDS}`),
      "",
      `**Word list**: ${words}`,
      "",
      "-# Members with Manage Messages are exempt. Enable the `Automod actions` log event to see actions in your log channel.",
    ].join("\n"),
  });
}

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Automod", body });
}

function warningCard(body) {
  return createCard({ color: 0xf1c40f, title: "Automod", body });
}

export default {
  category: "moderation",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure automatic moderation")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand.setName("show").setDescription("Show automod settings"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("invite")
        .setDescription("Toggle deletion of Discord invite links")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Enable anti-invite").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("mentions")
        .setDescription("Set mention spam limit (0 disables)")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription(`Delete messages with this many mentions or more (0-${MAX_MENTION_LIMIT})`)
            .setMinValue(0)
            .setMaxValue(MAX_MENTION_LIMIT)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("word-add")
        .setDescription("Add a banned word")
        .addStringOption((option) =>
          option.setName("word").setDescription("Word or phrase to ban").setMaxLength(60).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("word-remove")
        .setDescription("Remove a banned word")
        .addStringOption((option) =>
          option.setName("word").setDescription("Word or phrase to unban").setMaxLength(60).setRequired(true),
        ),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for automod command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const config = await getAutomodConfig(guildId);
      await replyCard(interaction, configCard(config), { ephemeral: true });
      return;
    }

    if (subcommand === "invite") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await setAntiInvite(guildId, enabled);
      await replyCard(
        interaction,
        successCard(`Anti-invite is now ${enabled ? "✅ enabled" : "❌ disabled"}.`),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "mentions") {
      const limit = interaction.options.getInteger("limit", true);
      const config = await setMentionLimit(guildId, limit);
      await replyCard(
        interaction,
        successCard(
          config.mentionLimit > 0
            ? `Messages with **${config.mentionLimit}+** mentions will be deleted.`
            : "Mention spam filter disabled.",
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "word-add") {
      const word = interaction.options.getString("word", true);
      const result = await addBannedWord(guildId, word);
      if (!result.added) {
        const reasons = {
          empty: "Please provide a non-empty word.",
          exists: "That word is already banned.",
          full: `Word list is full (max ${MAX_BANNED_WORDS}).`,
        };
        await replyCard(interaction, warningCard(reasons[result.reason] ?? "Could not add that word."), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        successCard(`Added \`${result.word}\` to the banned word list (${result.config.bannedWords.length}/${MAX_BANNED_WORDS}).`),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "word-remove") {
      const word = interaction.options.getString("word", true);
      const { removed } = await removeBannedWord(guildId, word);
      await replyCard(
        interaction,
        removed
          ? successCard("Word removed from the banned list.")
          : warningCard("That word is not in the banned list."),
        { ephemeral: true },
      );
    }
  },
};
