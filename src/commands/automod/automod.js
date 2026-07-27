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
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("automod", {
  en: {
    title: "Automod",
    none: "(none)",
    rule_anti_invite: "Anti-invite",
    rule_banned_word: "Banned words",
    rule_mention_spam: "Mention spam",
    rule_link_filter: "Link filter",
    rule_spam: "Message spam",
    rules_header: "**Rules**",
    detail_action: "action: {action}",
    detail_banned_words: "{count}/{max}, action: {action}",
    detail_mentions: "limit {limit}, action: {action}",
    detail_links: "allowlist {count} domain(s), action: {action}",
    detail_spam: "{max} msg/{interval}s, dup x{duplicates}, action: {action}",
    punishment_header: "**Punishment**",
    timeout_duration_line: "- Timeout duration: **{minutes}m**",
    escalation_line: "- Escalation: {parts}",
    escalation_off: "(off)",
    escalation_step_timeout: "{count} warns → timeout",
    escalation_step_kick: "{count} warns → kick",
    escalation_step_ban: "{count} warns → ban",
    exemptions_header: "**Exemptions**",
    exempt_channels_line: "- Channels: {list}",
    exempt_roles_line: "- Roles: {list}",
    word_list_line: "**Word list**: {list}",
    link_allowlist_line: "**Link allowlist**: {list}",
    footer_note: "-# Members with Manage Messages are always exempt. Turn on the `Automod actions` log event to see what automod does.",
    invite_enabled: "Anti-invite is now on.",
    invite_disabled: "Anti-invite is now off.",
    mentions_set: "Messages with **{limit}+** mentions will be actioned.",
    mentions_disabled: "The mention spam filter is off.",
    word_empty: "Type the word you want to ban.",
    word_exists: "That word is already banned.",
    word_list_full: "Word list is full (max {max}).",
    word_added: "Added `{word}` to the banned word list.",
    word_removed: "Word removed from the banned list.",
    word_not_found: "That word is not in the banned list.",
    links_enabled: "The link filter is now on.",
    links_disabled: "The link filter is now off.",
    links_empty_allowlist_note: "-# Allowlist is empty — every link will be actioned. Add domains with `/automod link-allow`.",
    domain_invalid: "That doesn't look like a domain — try something like `youtube.com`.",
    domain_exists: "That domain is already allowed.",
    allowlist_full: "Allowlist is full (max {max}).",
    domain_added: "Links to `{domain}` (and subdomains) are now allowed.",
    domain_removed: "Domain removed from the allowlist.",
    domain_not_found: "That domain is not in the allowlist.",
    spam_enabled: "Spam detection is on: **{max}** msgs per **{interval}s**, duplicates x**{duplicates}**.",
    spam_disabled: "Spam detection is off.",
    channel_exempted: "<#{channel}> is now exempt from automod.",
    channel_unexempted: "<#{channel}> is no longer exempt from automod.",
    channel_already_exempt: "That channel is already exempt.",
    channel_not_exempt: "That channel is not exempt.",
    role_exempted: "<@&{role}> is now exempt from automod.",
    role_unexempted: "<@&{role}> is no longer exempt from automod.",
    role_already_exempt: "That role is already exempt.",
    role_not_exempt: "That role is not exempt.",
    action_set: "**{rule}** now triggers: **{action}**.",
    timeout_duration_set: "Automod/escalation timeouts now last **{minutes}m**.",
    escalation_set_timeout: "**{count}** warns → timeout",
    escalation_set_kick: "**{count}** warns → kick",
    escalation_set_ban: "**{count}** warns → ban",
    escalation_ladder: "Escalation ladder: {parts}",
    escalation_disabled: "Escalation is off.",
  },
  id: {
    title: "Automod",
    none: "(kosong)",
    rule_anti_invite: "Anti-invite",
    rule_banned_word: "Kata terlarang",
    rule_mention_spam: "Spam mention",
    rule_link_filter: "Filter link",
    rule_spam: "Spam pesan",
    rules_header: "**Aturan**",
    detail_action: "aksi: {action}",
    detail_banned_words: "{count}/{max}, aksi: {action}",
    detail_mentions: "limit {limit}, aksi: {action}",
    detail_links: "allowlist {count} domain, aksi: {action}",
    detail_spam: "{max} pesan/{interval} detik, duplikat x{duplicates}, aksi: {action}",
    punishment_header: "**Hukuman**",
    timeout_duration_line: "- Durasi timeout: **{minutes} menit**",
    escalation_line: "- Eskalasi: {parts}",
    escalation_off: "(nonaktif)",
    escalation_step_timeout: "{count} peringatan → timeout",
    escalation_step_kick: "{count} peringatan → kick",
    escalation_step_ban: "{count} peringatan → ban",
    exemptions_header: "**Pengecualian**",
    exempt_channels_line: "- Channel: {list}",
    exempt_roles_line: "- Role: {list}",
    word_list_line: "**Daftar kata**: {list}",
    link_allowlist_line: "**Allowlist link**: {list}",
    footer_note: "-# Member dengan permission Manage Messages selalu dikecualikan. Nyalakan log event `Automod actions` untuk melihat aksi automod.",
    invite_enabled: "Anti-invite sekarang aktif.",
    invite_disabled: "Anti-invite sekarang nonaktif.",
    mentions_set: "Pesan dengan **{limit}+** mention akan ditindak.",
    mentions_disabled: "Filter spam mention sekarang nonaktif.",
    word_empty: "Ketik kata yang mau kamu larang.",
    word_exists: "Kata itu sudah ada di daftar terlarang.",
    word_list_full: "Daftar kata sudah penuh (maksimal {max}).",
    word_added: "`{word}` ditambahkan ke daftar kata terlarang.",
    word_removed: "Kata dihapus dari daftar terlarang.",
    word_not_found: "Kata itu tidak ada di daftar terlarang.",
    links_enabled: "Filter link sekarang aktif.",
    links_disabled: "Filter link sekarang nonaktif.",
    links_empty_allowlist_note: "-# Allowlist masih kosong — semua link bakal ditindak. Tambahkan domain lewat `/automod link-allow`.",
    domain_invalid: "Itu kayaknya bukan domain — coba yang seperti `youtube.com`.",
    domain_exists: "Domain itu sudah diizinkan.",
    allowlist_full: "Allowlist sudah penuh (maksimal {max}).",
    domain_added: "Link ke `{domain}` (termasuk subdomain) sekarang diizinkan.",
    domain_removed: "Domain dihapus dari allowlist.",
    domain_not_found: "Domain itu tidak ada di allowlist.",
    spam_enabled: "Deteksi spam aktif: **{max}** pesan per **{interval} detik**, duplikat x**{duplicates}**.",
    spam_disabled: "Deteksi spam sekarang nonaktif.",
    channel_exempted: "<#{channel}> sekarang dikecualikan dari automod.",
    channel_unexempted: "<#{channel}> tidak lagi dikecualikan dari automod.",
    channel_already_exempt: "Channel itu sudah dikecualikan.",
    channel_not_exempt: "Channel itu memang tidak dikecualikan.",
    role_exempted: "<@&{role}> sekarang dikecualikan dari automod.",
    role_unexempted: "<@&{role}> tidak lagi dikecualikan dari automod.",
    role_already_exempt: "Role itu sudah dikecualikan.",
    role_not_exempt: "Role itu memang tidak dikecualikan.",
    action_set: "**{rule}** sekarang memicu: **{action}**.",
    timeout_duration_set: "Timeout automod/eskalasi sekarang berdurasi **{minutes} menit**.",
    escalation_set_timeout: "**{count}** peringatan → timeout",
    escalation_set_kick: "**{count}** peringatan → kick",
    escalation_set_ban: "**{count}** peringatan → ban",
    escalation_ladder: "Tangga eskalasi: {parts}",
    escalation_disabled: "Eskalasi dimatikan.",
  },
});

const RULE_LABELS = {
  anti_invite: "Anti-invite",
  banned_word: "Banned words",
  mention_spam: "Mention spam",
  link_filter: "Link filter",
  spam: "Message spam",
};

function ruleLabel(t, rule) {
  return RULE_LABELS[rule] ? t(`automod.rule_${rule}`) : rule;
}

function statusLine(label, enabled, detail = null) {
  return `${enabled ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`;
}

function formatList(t, values, formatter = (v) => `\`${v}\``) {
  return values.length > 0 ? values.map(formatter).join(", ") : t("automod.none");
}

function configCard(t, config) {
  const escalationParts = [];
  if (config.escalation.timeoutAt > 0) escalationParts.push(t("automod.escalation_step_timeout", { count: config.escalation.timeoutAt }));
  if (config.escalation.kickAt > 0) escalationParts.push(t("automod.escalation_step_kick", { count: config.escalation.kickAt }));
  if (config.escalation.banAt > 0) escalationParts.push(t("automod.escalation_step_ban", { count: config.escalation.banAt }));

  return createCard({
    color: 0x3498db,
    title: t("automod.title"),
    body: [
      t("automod.rules_header"),
      statusLine(t("automod.rule_anti_invite"), config.antiInvite, t("automod.detail_action", { action: config.actions.anti_invite })),
      statusLine(
        t("automod.rule_banned_word"),
        config.bannedWords.length > 0,
        t("automod.detail_banned_words", {
          count: config.bannedWords.length,
          max: MAX_BANNED_WORDS,
          action: config.actions.banned_word,
        }),
      ),
      statusLine(
        t("automod.rule_mention_spam"),
        config.mentionLimit > 0,
        config.mentionLimit > 0
          ? t("automod.detail_mentions", { limit: config.mentionLimit, action: config.actions.mention_spam })
          : null,
      ),
      statusLine(
        t("automod.rule_link_filter"),
        config.linkFilter,
        config.linkFilter
          ? t("automod.detail_links", { count: config.linkAllowlist.length, action: config.actions.link_filter })
          : null,
      ),
      statusLine(
        t("automod.rule_spam"),
        config.spamEnabled,
        config.spamEnabled
          ? t("automod.detail_spam", {
              max: config.spamMaxMessages,
              interval: config.spamIntervalSeconds,
              duplicates: config.spamDuplicateLimit,
              action: config.actions.spam,
            })
          : null,
      ),
      "",
      t("automod.punishment_header"),
      t("automod.timeout_duration_line", { minutes: config.timeoutMinutes }),
      t("automod.escalation_line", {
        parts: escalationParts.length > 0 ? escalationParts.join(" · ") : t("automod.escalation_off"),
      }),
      "",
      t("automod.exemptions_header"),
      t("automod.exempt_channels_line", { list: formatList(t, config.exemptChannels, (id) => `<#${id}>`) }),
      t("automod.exempt_roles_line", { list: formatList(t, config.exemptRoles, (id) => `<@&${id}>`) }),
      "",
      t("automod.word_list_line", { list: formatList(t, config.bannedWords) }),
      t("automod.link_allowlist_line", { list: formatList(t, config.linkAllowlist) }),
      "",
      t("automod.footer_note"),
    ].join("\n"),
  });
}

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("automod.title"), body });
}

function warningCard(t, body) {
  return createCard({ color: 0xf1c40f, title: t("automod.title"), body });
}

export default {
  category: "automod",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Set up automatic moderation")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("show").setDescription("Show automod settings"))
    .addSubcommand((sub) =>
      sub
        .setName("invite")
        .setDescription("Turn deleting Discord invite links on or off")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Turn anti-invite on or off").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("mentions")
        .setDescription("Set the mention spam limit (0 turns it off)")
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
        .setDescription("Turn the link filter on or off (blocks links not on the allowlist)")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Turn the link filter on or off").setRequired(true),
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
        .setDescription("Set up message spam detection")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Turn spam detection on or off").setRequired(true),
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
            .setDescription("Which rule to change")
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
        .setDescription("Auto-punish at warning thresholds (0 turns a step off)")
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

    const t = ctx.t;
    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const config = await getAutomodConfig(guildId);
      await replyCard(interaction, configCard(t, config), { ephemeral: true });
      return;
    }

    if (subcommand === "invite") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await updateAutomodConfig(guildId, (config) => {
        config.antiInvite = enabled;
      });
      await replyCard(interaction, successCard(t, t(enabled ? "automod.invite_enabled" : "automod.invite_disabled")), {
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
        successCard(t, limit > 0 ? t("automod.mentions_set", { limit }) : t("automod.mentions_disabled")),
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
        empty: warningCard(t, t("automod.word_empty")),
        exists: warningCard(t, t("automod.word_exists")),
        full: warningCard(t, t("automod.word_list_full", { max: MAX_BANNED_WORDS })),
        added: successCard(t, t("automod.word_added", { word })),
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
        result ? successCard(t, t("automod.word_removed")) : warningCard(t, t("automod.word_not_found")),
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
        successCard(t, [
          t(enabled ? "automod.links_enabled" : "automod.links_disabled"),
          ...(enabled && config.linkAllowlist.length === 0
            ? [t("automod.links_empty_allowlist_note")]
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
        invalid: warningCard(t, t("automod.domain_invalid")),
        exists: warningCard(t, t("automod.domain_exists")),
        full: warningCard(t, t("automod.allowlist_full", { max: MAX_ALLOWLIST_DOMAINS })),
        added: successCard(t, t("automod.domain_added", { domain })),
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
        result ? successCard(t, t("automod.domain_removed")) : warningCard(t, t("automod.domain_not_found")),
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
          t,
          enabled
            ? t("automod.spam_enabled", {
                max: config.spamMaxMessages,
                interval: config.spamIntervalSeconds,
                duplicates: config.spamDuplicateLimit,
              })
            : t("automod.spam_disabled"),
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
          ? successCard(t, t(adding ? "automod.channel_exempted" : "automod.channel_unexempted", { channel: channel.id }))
          : warningCard(t, t(adding ? "automod.channel_already_exempt" : "automod.channel_not_exempt")),
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
          ? successCard(t, t(adding ? "automod.role_exempted" : "automod.role_unexempted", { role: role.id }))
          : warningCard(t, t(adding ? "automod.role_already_exempt" : "automod.role_not_exempt")),
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
        successCard(t, t("automod.action_set", { rule: ruleLabel(t, rule), action })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "timeout-duration") {
      const minutes = interaction.options.getInteger("minutes", true);
      await updateAutomodConfig(guildId, (config) => {
        config.timeoutMinutes = minutes;
      });
      await replyCard(interaction, successCard(t, t("automod.timeout_duration_set", { minutes })), {
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
      if (config.escalation.timeoutAt > 0) parts.push(t("automod.escalation_set_timeout", { count: config.escalation.timeoutAt }));
      if (config.escalation.kickAt > 0) parts.push(t("automod.escalation_set_kick", { count: config.escalation.kickAt }));
      if (config.escalation.banAt > 0) parts.push(t("automod.escalation_set_ban", { count: config.escalation.banAt }));

      await replyCard(
        interaction,
        successCard(
          t,
          parts.length > 0 ? t("automod.escalation_ladder", { parts: parts.join(" · ") }) : t("automod.escalation_disabled"),
        ),
        { ephemeral: true },
      );
    }
  },
};
