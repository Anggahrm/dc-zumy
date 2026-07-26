import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  AUTOMOD_ACTIONS,
  AUTOMOD_RULES,
  getAutomodConfig,
  MAX_ALLOWLIST_DOMAINS,
  MAX_BANNED_WORDS,
  MAX_MENTION_LIMIT,
  updateAutomodConfig,
} from "#services/automod.js";
import { createCard, replyCard } from "#utils/respond.js";

const RULE_LABELS = {
  anti_invite: "Anti-invite",
  banned_word: "Banned words",
  mention_spam: "Mention spam",
  link_filter: "Link filter",
  spam: "Message spam",
};

function statusLine(label, enabled, detail = null) {
  return `${enabled ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`;
}

function formatList(values, formatter = (v) => `\`${v}\``) {
  return values.length > 0 ? values.map(formatter).join(", ") : "(none)";
}

function configCard(config) {
  const escalationParts = [];
  if (config.escalation.timeoutAt > 0) escalationParts.push(`${config.escalation.timeoutAt} warns → timeout`);
  if (config.escalation.kickAt > 0) escalationParts.push(`${config.escalation.kickAt} warns → kick`);
  if (config.escalation.banAt > 0) escalationParts.push(`${config.escalation.banAt} warns → ban`);

  return createCard({
    color: 0x3498db,
    title: "Automod",
    body: [
      "**Rules**",
      statusLine("Anti-invite", config.antiInvite, `action: ${config.actions.anti_invite}`),
      statusLine(
        "Banned words",
        config.bannedWords.length > 0,
        `${config.bannedWords.length}/${MAX_BANNED_WORDS}, action: ${config.actions.banned_word}`,
      ),
      statusLine(
        "Mention spam",
        config.mentionLimit > 0,
        config.mentionLimit > 0 ? `limit ${config.mentionLimit}, action: ${config.actions.mention_spam}` : null,
      ),
      statusLine(
        "Link filter",
        config.linkFilter,
        config.linkFilter ? `allowlist ${config.linkAllowlist.length} domain(s), action: ${config.actions.link_filter}` : null,
      ),
      statusLine(
        "Message spam",
        config.spamEnabled,
        config.spamEnabled
          ? `${config.spamMaxMessages} msg/${config.spamIntervalSeconds}s, dup x${config.spamDuplicateLimit}, action: ${config.actions.spam}`
          : null,
      ),
      "",
      "**Punishment**",
      `- Timeout duration: **${config.timeoutMinutes}m**`,
      `- Escalation: ${escalationParts.length > 0 ? escalationParts.join(" · ") : "(off)"}`,
      "",
      "**Exemptions**",
      `- Channels: ${formatList(config.exemptChannels, (id) => `<#${id}>`)}`,
      `- Roles: ${formatList(config.exemptRoles, (id) => `<@&${id}>`)}`,
      "",
      `**Word list**: ${formatList(config.bannedWords)}`,
      `**Link allowlist**: ${formatList(config.linkAllowlist)}`,
      "",
      "-# Members with Manage Messages are always exempt. Enable the `Automod actions` log event to see actions.",
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
    .addSubcommand((sub) => sub.setName("show").setDescription("Show automod settings"))
    .addSubcommand((sub) =>
      sub
        .setName("invite")
        .setDescription("Toggle deletion of Discord invite links")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Enable anti-invite").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("mentions")
        .setDescription("Set mention spam limit (0 disables)")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription(`Trigger at this many mentions (0-${MAX_MENTION_LIMIT})`)
            .setMinValue(0)
            .setMaxValue(MAX_MENTION_LIMIT)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("word-add")
        .setDescription("Add a banned word (use * as wildcard, e.g. spam*)")
        .addStringOption((option) =>
          option.setName("word").setDescription("Word or phrase to ban").setMaxLength(60).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("word-remove")
        .setDescription("Remove a banned word")
        .addStringOption((option) =>
          option.setName("word").setDescription("Word to unban").setMaxLength(60).setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("links")
        .setDescription("Toggle the link filter (blocks links not on the allowlist)")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Enable link filter").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("link-allow")
        .setDescription("Allow a domain (covers subdomains)")
        .addStringOption((option) =>
          option.setName("domain").setDescription("e.g. youtube.com").setMaxLength(100).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("link-unallow")
        .setDescription("Remove a domain from the allowlist")
        .addStringOption((option) =>
          option.setName("domain").setDescription("Domain to remove").setMaxLength(100).setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("spam")
        .setDescription("Configure message spam detection")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Enable spam detection").setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("max_messages").setDescription("Messages allowed per window (3-30)").setMinValue(3).setMaxValue(30).setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("interval_seconds").setDescription("Window length in seconds (2-60)").setMinValue(2).setMaxValue(60).setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("duplicate_limit").setDescription("Identical messages allowed (2-10)").setMinValue(2).setMaxValue(10).setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("exempt-channel")
        .setDescription("Exempt a channel from automod")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to exempt")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unexempt-channel")
        .setDescription("Remove a channel exemption")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to re-include")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("exempt-role")
        .setDescription("Exempt a role from automod")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to exempt").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unexempt-role")
        .setDescription("Remove a role exemption")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to re-include").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("action")
        .setDescription("Set the action for a rule")
        .addStringOption((option) =>
          option
            .setName("rule")
            .setDescription("Rule to configure")
            .addChoices(...AUTOMOD_RULES.map((rule) => ({ name: RULE_LABELS[rule] ?? rule, value: rule })))
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("What happens on violation (all actions also delete)")
            .addChoices(...AUTOMOD_ACTIONS.map((action) => ({ name: action, value: action })))
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("timeout-duration")
        .setDescription("Set automod/escalation timeout length")
        .addIntegerOption((option) =>
          option.setName("minutes").setDescription("Minutes (1-1440)").setMinValue(1).setMaxValue(1440).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("escalation")
        .setDescription("Auto-punish at warning thresholds (0 disables a step)")
        .addIntegerOption((option) =>
          option.setName("timeout_at").setDescription("Warnings to trigger a timeout (0-50)").setMinValue(0).setMaxValue(50).setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("kick_at").setDescription("Warnings to trigger a kick (0-50)").setMinValue(0).setMaxValue(50).setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("ban_at").setDescription("Warnings to trigger a ban (0-50)").setMinValue(0).setMaxValue(50).setRequired(false),
        ),
    ),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused(true);
    const query = String(focused.value ?? "").toLowerCase();
    const config = await getAutomodConfig(interaction.guildId, { preferCache: true });
    const source = focused.name === "domain" ? config.linkAllowlist : config.bannedWords;
    await interaction.respond(
      source
        .filter((value) => !query || value.includes(query))
        .slice(0, 25)
        .map((value) => ({ name: value, value })),
    );
  },
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
      await updateAutomodConfig(guildId, (config) => {
        config.antiInvite = enabled;
      });
      await replyCard(interaction, successCard(`Anti-invite is now ${enabled ? "✅ enabled" : "❌ disabled"}.`), {
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "mentions") {
      const limit = interaction.options.getInteger("limit", true);
      await updateAutomodConfig(guildId, (config) => {
        config.mentionLimit = limit;
      });
      await replyCard(
        interaction,
        successCard(limit > 0 ? `Messages with **${limit}+** mentions will be actioned.` : "Mention spam filter disabled."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "word-add") {
      const word = interaction.options.getString("word", true).trim().toLowerCase();
      const { result } = await updateAutomodConfig(guildId, (config) => {
        if (!word) return "empty";
        if (config.bannedWords.includes(word)) return "exists";
        if (config.bannedWords.length >= MAX_BANNED_WORDS) return "full";
        config.bannedWords = [...config.bannedWords, word];
        return "added";
      });

      const responses = {
        empty: warningCard("Please provide a non-empty word."),
        exists: warningCard("That word is already banned."),
        full: warningCard(`Word list is full (max ${MAX_BANNED_WORDS}).`),
        added: successCard(`Added \`${word}\` to the banned word list.`),
      };
      await replyCard(interaction, responses[result], { ephemeral: true });
      return;
    }

    if (subcommand === "word-remove") {
      const word = interaction.options.getString("word", true).trim().toLowerCase();
      const { result } = await updateAutomodConfig(guildId, (config) => {
        const next = config.bannedWords.filter((entry) => entry !== word);
        if (next.length === config.bannedWords.length) return false;
        config.bannedWords = next;
        return true;
      });

      await replyCard(
        interaction,
        result ? successCard("Word removed from the banned list.") : warningCard("That word is not in the banned list."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "links") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const { config } = await updateAutomodConfig(guildId, (c) => {
        c.linkFilter = enabled;
      });
      await replyCard(
        interaction,
        successCard([
          `Link filter is now ${enabled ? "✅ enabled" : "❌ disabled"}.`,
          ...(enabled && config.linkAllowlist.length === 0
            ? ["-# Allowlist is empty — every link will be actioned. Add domains with `/automod link-allow`."]
            : []),
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "link-allow") {
      const domain = interaction.options.getString("domain", true).trim().toLowerCase().replace(/^www\./, "");
      const { result } = await updateAutomodConfig(guildId, (config) => {
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return "invalid";
        if (config.linkAllowlist.includes(domain)) return "exists";
        if (config.linkAllowlist.length >= MAX_ALLOWLIST_DOMAINS) return "full";
        config.linkAllowlist = [...config.linkAllowlist, domain];
        return "added";
      });

      const responses = {
        invalid: warningCard("That doesn't look like a valid domain (e.g. `youtube.com`)."),
        exists: warningCard("That domain is already allowed."),
        full: warningCard(`Allowlist is full (max ${MAX_ALLOWLIST_DOMAINS}).`),
        added: successCard(`Links to \`${domain}\` (and subdomains) are now allowed.`),
      };
      await replyCard(interaction, responses[result], { ephemeral: true });
      return;
    }

    if (subcommand === "link-unallow") {
      const domain = interaction.options.getString("domain", true).trim().toLowerCase();
      const { result } = await updateAutomodConfig(guildId, (config) => {
        const next = config.linkAllowlist.filter((entry) => entry !== domain);
        if (next.length === config.linkAllowlist.length) return false;
        config.linkAllowlist = next;
        return true;
      });

      await replyCard(
        interaction,
        result ? successCard("Domain removed from the allowlist.") : warningCard("That domain is not in the allowlist."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "spam") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const maxMessages = interaction.options.getInteger("max_messages");
      const intervalSeconds = interaction.options.getInteger("interval_seconds");
      const duplicateLimit = interaction.options.getInteger("duplicate_limit");

      const { config } = await updateAutomodConfig(guildId, (c) => {
        c.spamEnabled = enabled;
        if (maxMessages != null) c.spamMaxMessages = maxMessages;
        if (intervalSeconds != null) c.spamIntervalSeconds = intervalSeconds;
        if (duplicateLimit != null) c.spamDuplicateLimit = duplicateLimit;
      });

      await replyCard(
        interaction,
        successCard(
          enabled
            ? `Spam detection ✅ enabled: **${config.spamMaxMessages}** msgs per **${config.spamIntervalSeconds}s**, duplicates x**${config.spamDuplicateLimit}**.`
            : "Spam detection ❌ disabled.",
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "exempt-channel" || subcommand === "unexempt-channel") {
      const channel = interaction.options.getChannel("channel", true);
      const adding = subcommand === "exempt-channel";
      const { result } = await updateAutomodConfig(guildId, (config) => {
        const has = config.exemptChannels.includes(channel.id);
        if (adding === has) return false;
        config.exemptChannels = adding
          ? [...config.exemptChannels, channel.id]
          : config.exemptChannels.filter((id) => id !== channel.id);
        return true;
      });

      await replyCard(
        interaction,
        result
          ? successCard(`<#${channel.id}> is ${adding ? "now exempt from" : "no longer exempt from"} automod.`)
          : warningCard(adding ? "That channel is already exempt." : "That channel is not exempt."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "exempt-role" || subcommand === "unexempt-role") {
      const role = interaction.options.getRole("role", true);
      const adding = subcommand === "exempt-role";
      const { result } = await updateAutomodConfig(guildId, (config) => {
        const has = config.exemptRoles.includes(role.id);
        if (adding === has) return false;
        config.exemptRoles = adding
          ? [...config.exemptRoles, role.id]
          : config.exemptRoles.filter((id) => id !== role.id);
        return true;
      });

      await replyCard(
        interaction,
        result
          ? successCard(`<@&${role.id}> is ${adding ? "now exempt from" : "no longer exempt from"} automod.`)
          : warningCard(adding ? "That role is already exempt." : "That role is not exempt."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "action") {
      const rule = interaction.options.getString("rule", true);
      const action = interaction.options.getString("action", true);
      await updateAutomodConfig(guildId, (config) => {
        config.actions[rule] = action;
      });
      await replyCard(
        interaction,
        successCard(`**${RULE_LABELS[rule] ?? rule}** now triggers: **${action}**.`),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "timeout-duration") {
      const minutes = interaction.options.getInteger("minutes", true);
      await updateAutomodConfig(guildId, (config) => {
        config.timeoutMinutes = minutes;
      });
      await replyCard(interaction, successCard(`Automod/escalation timeouts now last **${minutes}m**.`), {
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "escalation") {
      const timeoutAt = interaction.options.getInteger("timeout_at");
      const kickAt = interaction.options.getInteger("kick_at");
      const banAt = interaction.options.getInteger("ban_at");

      const { config } = await updateAutomodConfig(guildId, (c) => {
        if (timeoutAt != null) c.escalation.timeoutAt = timeoutAt;
        if (kickAt != null) c.escalation.kickAt = kickAt;
        if (banAt != null) c.escalation.banAt = banAt;
      });

      const parts = [];
      if (config.escalation.timeoutAt > 0) parts.push(`**${config.escalation.timeoutAt}** warns → timeout`);
      if (config.escalation.kickAt > 0) parts.push(`**${config.escalation.kickAt}** warns → kick`);
      if (config.escalation.banAt > 0) parts.push(`**${config.escalation.banAt}** warns → ban`);

      await replyCard(
        interaction,
        successCard(parts.length > 0 ? `Escalation ladder: ${parts.join(" · ")}` : "Escalation disabled."),
        { ephemeral: true },
      );
    }
  },
};
