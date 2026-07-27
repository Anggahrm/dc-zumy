import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getLevelsConfig, MAX_LEVEL_REWARDS, setMemberXp, updateLevelsConfig } from "#services/levels.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("levelconfig", {
  en: {
    title: "Leveling",
    none: "none yet",
    default_placeholder: "(default)",
    current_settings: "**Current settings**",
    status_enabled: "Leveling: **on**",
    status_disabled: "Leveling: **off**",
    xp_per_message_line: "- XP per message: **{min}-{max}** (multiplier x{multiplier})",
    cooldown_line: "- Cooldown: **{seconds}s**",
    voice_on_line: "- Voice XP: **{perMinute}/min** (2+ members, not deafened)",
    voice_off_line: "- Voice XP: off",
    announce_in_channel_line: "- Level-up announce: in <#{channel}>",
    announce_same_channel_line: "- Level-up announce: in the same channel",
    announce_off_line: "- Level-up announce: off",
    levelup_message_line: "- Level-up message: {message}",
    reward_mode_stack_line: "- Reward mode: **stack**",
    reward_mode_replace_line: "- Reward mode: **replace**",
    no_xp_channels_header: "**No-XP channels**",
    no_xp_roles_header: "**No-XP roles**",
    role_rewards_header: "**Role rewards** ({count}/{max})",
    reward_row: "- Level {level} → <@&{role}>",
    rewards_none_row: "- none yet",
    toggle_enabled: "Leveling is now on.",
    toggle_disabled: "Leveling is now off.",
    rate_updated: "XP rate: **{min}-{max}** per message, cooldown **{seconds}s**, multiplier **x{multiplier}**.",
    announce_enabled_line: "Level-up announcements are now on.",
    announce_disabled_line: "Level-up announcements are now off.",
    announce_where_channel_line: "- Where: <#{channel}>",
    announce_where_same_line: "- Where: same channel as the message",
    announce_message_line: "- Message: {message}",
    channel_no_xp: "<#{channel}> no longer gives XP.",
    channel_gives_xp: "<#{channel}> now gives XP.",
    role_no_xp: "Members with <@&{role}> no longer gain XP.",
    role_gains_xp: "Members with <@&{role}> now gain XP.",
    role_unusable: "I can't use that role — it's managed, @everyone, or above my highest role.",
    rewards_full: "Reward list is full (max {max}).",
    reward_added: "Level **{level}** now rewards <@&{role}>.",
    reward_removed: "Reward for level **{level}** removed.",
    reward_not_found: "No reward at that level.",
    stack_on: "Rewards now **stack** (members keep all earned roles).",
    stack_off: "Rewards now **replace** (only the highest earned role is kept).",
    voice_enabled: "Voice XP is on: **{perMinute}/min** for channels with 2+ members (deafened members earn nothing).",
    voice_disabled: "Voice XP is off.",
    xp_set: "**{user}** now has **{xp}** XP (level **{level}**).",
  },
  id: {
    title: "Leveling",
    none: "belum ada",
    default_placeholder: "(bawaan)",
    current_settings: "**Pengaturan saat ini**",
    status_enabled: "Leveling: **aktif**",
    status_disabled: "Leveling: **nonaktif**",
    xp_per_message_line: "- XP per pesan: **{min}-{max}** (multiplier x{multiplier})",
    cooldown_line: "- Cooldown: **{seconds} detik**",
    voice_on_line: "- Voice XP: **{perMinute}/menit** (2+ member, tidak deafen)",
    voice_off_line: "- Voice XP: mati",
    announce_in_channel_line: "- Pengumuman level-up: di <#{channel}>",
    announce_same_channel_line: "- Pengumuman level-up: di channel yang sama",
    announce_off_line: "- Pengumuman level-up: mati",
    levelup_message_line: "- Pesan level-up: {message}",
    reward_mode_stack_line: "- Mode reward: **stack**",
    reward_mode_replace_line: "- Mode reward: **replace**",
    no_xp_channels_header: "**Channel tanpa XP**",
    no_xp_roles_header: "**Role tanpa XP**",
    role_rewards_header: "**Role reward** ({count}/{max})",
    reward_row: "- Level {level} → <@&{role}>",
    rewards_none_row: "- belum ada",
    toggle_enabled: "Leveling sekarang aktif.",
    toggle_disabled: "Leveling sekarang nonaktif.",
    rate_updated: "Rate XP: **{min}-{max}** per pesan, cooldown **{seconds} detik**, multiplier **x{multiplier}**.",
    announce_enabled_line: "Pengumuman level-up sekarang aktif.",
    announce_disabled_line: "Pengumuman level-up sekarang nonaktif.",
    announce_where_channel_line: "- Di mana: <#{channel}>",
    announce_where_same_line: "- Di mana: channel yang sama dengan pesannya",
    announce_message_line: "- Pesan: {message}",
    channel_no_xp: "<#{channel}> tidak lagi memberi XP.",
    channel_gives_xp: "<#{channel}> sekarang memberi XP.",
    role_no_xp: "Member dengan <@&{role}> tidak lagi dapat XP.",
    role_gains_xp: "Member dengan <@&{role}> sekarang dapat XP.",
    role_unusable: "Aku tidak bisa pakai role itu — role-nya managed, @everyone, atau di atas role tertinggiku.",
    rewards_full: "Daftar reward sudah penuh (maksimal {max}).",
    reward_added: "Level **{level}** sekarang memberi reward <@&{role}>.",
    reward_removed: "Reward untuk level **{level}** dihapus.",
    reward_not_found: "Tidak ada reward di level itu.",
    stack_on: "Reward sekarang **stack** (member menyimpan semua role yang didapat).",
    stack_off: "Reward sekarang **replace** (hanya role tertinggi yang disimpan).",
    voice_enabled: "Voice XP aktif: **{perMinute}/menit** untuk channel dengan 2+ member (member yang deafen tidak dapat apa-apa).",
    voice_disabled: "Voice XP nonaktif.",
    xp_set: "**{user}** sekarang punya **{xp}** XP (level **{level}**).",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("levelconfig.title"), body });
}

function warningCard(t, body) {
  return createCard({ color: 0xf1c40f, title: t("levelconfig.title"), body });
}

function formatList(values, formatter, noneText) {
  return values.length > 0 ? values.map(formatter).join(", ") : noneText;
}

function configCard(t, config) {
  const rewards = config.rewards.length > 0
    ? config.rewards.map((reward) => t("levelconfig.reward_row", { level: reward.level, role: reward.roleId })).join("\n")
    : t("levelconfig.rewards_none_row");

  const announceLine = config.announce
    ? (config.announceChannelId
      ? t("levelconfig.announce_in_channel_line", { channel: config.announceChannelId })
      : t("levelconfig.announce_same_channel_line"))
    : t("levelconfig.announce_off_line");

  return createCard({
    color: 0x3498db,
    title: t("levelconfig.title"),
    body: [
      t("levelconfig.current_settings"),
      config.enabled ? t("levelconfig.status_enabled") : t("levelconfig.status_disabled"),
      t("levelconfig.xp_per_message_line", { min: config.xpMin, max: config.xpMax, multiplier: config.multiplier }),
      t("levelconfig.cooldown_line", { seconds: config.cooldownSeconds }),
      config.voiceXpEnabled
        ? t("levelconfig.voice_on_line", { perMinute: config.voiceXpPerMinute })
        : t("levelconfig.voice_off_line"),
      announceLine,
      t("levelconfig.levelup_message_line", { message: config.levelUpMessage ?? t("levelconfig.default_placeholder") }),
      config.stackRewards ? t("levelconfig.reward_mode_stack_line") : t("levelconfig.reward_mode_replace_line"),
      "",
      t("levelconfig.no_xp_channels_header"),
      `- ${formatList(config.noXpChannels, (id) => `<#${id}>`, t("levelconfig.none"))}`,
      t("levelconfig.no_xp_roles_header"),
      `- ${formatList(config.noXpRoles, (id) => `<@&${id}>`, t("levelconfig.none"))}`,
      "",
      t("levelconfig.role_rewards_header", { count: config.rewards.length, max: MAX_LEVEL_REWARDS }),
      rewards,
    ].join("\n"),
  });
}

export default {
  category: "levels",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("levelconfig")
    .setDescription("Set up leveling for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("show").setDescription("Show leveling settings"))
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Turn leveling on or off")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("True = on, False = off").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("rate")
        .setDescription("Change XP amounts and cooldown")
        .addIntegerOption((option) =>
          option.setName("xp_min").setDescription("Min XP per message (1-100)").setMinValue(1).setMaxValue(100).setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("xp_max").setDescription("Max XP per message (1-200)").setMinValue(1).setMaxValue(200).setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("cooldown").setDescription("Seconds between XP gains (0-600)").setMinValue(0).setMaxValue(600).setRequired(false),
        )
        .addNumberOption((option) =>
          option.setName("multiplier").setDescription("XP multiplier (0.1-10)").setMinValue(0.1).setMaxValue(10).setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("announce")
        .setDescription("Set up level-up announcements")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Turn announcements on or off").setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Announce here instead of the active channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Custom message — use {user} {username} {level} {server}. Empty = default")
            .setMaxLength(300)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("no-xp-channel")
        .setDescription("Turn XP on or off for a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Which channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("no-xp-role")
        .setDescription("Turn XP on or off for a role")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Which role").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reward-add")
        .setDescription("Give a role when members reach a level")
        .addIntegerOption((option) =>
          option.setName("level").setDescription("Level to reward (2-500)").setMinValue(2).setMaxValue(500).setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to grant").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reward-remove")
        .setDescription("Remove a level reward")
        .addIntegerOption((option) =>
          option.setName("level").setDescription("Level whose reward to remove").setMinValue(2).setMaxValue(500).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("stack")
        .setDescription("Choose whether rewards stack or replace")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("True = keep all earned roles, False = keep only the highest").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("voice")
        .setDescription("Set up voice XP")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Turn voice XP on or off").setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("xp_per_minute").setDescription("XP per minute (1-20, default 2)").setMinValue(1).setMaxValue(20).setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("xp-set")
        .setDescription("Set a member's XP to an exact amount")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member").setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("xp").setDescription("New XP value").setMinValue(0).setMaxValue(100_000_000).setRequired(true),
        ),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for levelconfig command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();
    const t = ctx.t;

    if (subcommand === "show") {
      const config = await getLevelsConfig(guildId);
      await replyCard(interaction, configCard(t, config), { ephemeral: true });
      return;
    }

    if (subcommand === "toggle") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await updateLevelsConfig(guildId, (config) => {
        config.enabled = enabled;
      });
      await replyCard(
        interaction,
        successCard(t, enabled ? t("levelconfig.toggle_enabled") : t("levelconfig.toggle_disabled")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "rate") {
      const xpMin = interaction.options.getInteger("xp_min");
      const xpMax = interaction.options.getInteger("xp_max");
      const cooldown = interaction.options.getInteger("cooldown");
      const multiplier = interaction.options.getNumber("multiplier");

      const { config } = await updateLevelsConfig(guildId, (c) => {
        if (xpMin != null) c.xpMin = xpMin;
        if (xpMax != null) c.xpMax = xpMax;
        if (cooldown != null) c.cooldownSeconds = cooldown;
        if (multiplier != null) c.multiplier = Math.round(multiplier * 10) / 10;
      });

      await replyCard(
        interaction,
        successCard(
          t,
          t("levelconfig.rate_updated", {
            min: config.xpMin,
            max: config.xpMax,
            seconds: config.cooldownSeconds,
            multiplier: config.multiplier,
          }),
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "announce") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const channel = interaction.options.getChannel("channel");
      const message = interaction.options.getString("message");

      const { config } = await updateLevelsConfig(guildId, (c) => {
        c.announce = enabled;
        if (channel) c.announceChannelId = channel.id;
        if (message != null) c.levelUpMessage = message.trim() || null;
      });

      await replyCard(
        interaction,
        successCard(t, [
          config.announce ? t("levelconfig.announce_enabled_line") : t("levelconfig.announce_disabled_line"),
          ...(config.announce
            ? [
              config.announceChannelId
                ? t("levelconfig.announce_where_channel_line", { channel: config.announceChannelId })
                : t("levelconfig.announce_where_same_line"),
              t("levelconfig.announce_message_line", { message: config.levelUpMessage ?? t("levelconfig.default_placeholder") }),
            ]
            : []),
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "no-xp-channel") {
      const channel = interaction.options.getChannel("channel", true);
      const { result } = await updateLevelsConfig(guildId, (config) => {
        const has = config.noXpChannels.includes(channel.id);
        config.noXpChannels = has
          ? config.noXpChannels.filter((id) => id !== channel.id)
          : [...config.noXpChannels, channel.id];
        return !has;
      });

      await replyCard(
        interaction,
        successCard(
          t,
          result
            ? t("levelconfig.channel_no_xp", { channel: channel.id })
            : t("levelconfig.channel_gives_xp", { channel: channel.id }),
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "no-xp-role") {
      const role = interaction.options.getRole("role", true);
      const { result } = await updateLevelsConfig(guildId, (config) => {
        const has = config.noXpRoles.includes(role.id);
        config.noXpRoles = has
          ? config.noXpRoles.filter((id) => id !== role.id)
          : [...config.noXpRoles, role.id];
        return !has;
      });

      await replyCard(
        interaction,
        successCard(
          t,
          result
            ? t("levelconfig.role_no_xp", { role: role.id })
            : t("levelconfig.role_gains_xp", { role: role.id }),
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "reward-add") {
      const level = interaction.options.getInteger("level", true);
      const role = interaction.options.getRole("role", true);
      const me = guild.members.me;

      if (role.id === guild.id || role.managed || (me && role.position >= me.roles.highest.position)) {
        await replyCard(
          interaction,
          warningCard(t, t("levelconfig.role_unusable")),
          { ephemeral: true },
        );
        return;
      }

      const { result } = await updateLevelsConfig(guildId, (config) => {
        if (config.rewards.length >= MAX_LEVEL_REWARDS && !config.rewards.some((r) => r.level === level)) {
          return "full";
        }
        config.rewards = [
          ...config.rewards.filter((r) => r.level !== level),
          { level, roleId: role.id },
        ].sort((a, b) => a.level - b.level);
        return "ok";
      });

      await replyCard(
        interaction,
        result === "full"
          ? warningCard(t, t("levelconfig.rewards_full", { max: MAX_LEVEL_REWARDS }))
          : successCard(t, t("levelconfig.reward_added", { level, role: role.id })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "reward-remove") {
      const level = interaction.options.getInteger("level", true);
      const { result } = await updateLevelsConfig(guildId, (config) => {
        const next = config.rewards.filter((r) => r.level !== level);
        if (next.length === config.rewards.length) return false;
        config.rewards = next;
        return true;
      });

      await replyCard(
        interaction,
        result
          ? successCard(t, t("levelconfig.reward_removed", { level }))
          : warningCard(t, t("levelconfig.reward_not_found")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "stack") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await updateLevelsConfig(guildId, (config) => {
        config.stackRewards = enabled;
      });
      await replyCard(
        interaction,
        successCard(t, enabled ? t("levelconfig.stack_on") : t("levelconfig.stack_off")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "voice") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const xpPerMinute = interaction.options.getInteger("xp_per_minute");
      const { config } = await updateLevelsConfig(guildId, (c) => {
        c.voiceXpEnabled = enabled;
        if (xpPerMinute != null) c.voiceXpPerMinute = xpPerMinute;
      });

      await replyCard(
        interaction,
        successCard(
          t,
          config.voiceXpEnabled
            ? t("levelconfig.voice_enabled", { perMinute: config.voiceXpPerMinute })
            : t("levelconfig.voice_disabled"),
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "xp-set") {
      const target = interaction.options.getUser("target", true);
      const xp = interaction.options.getInteger("xp", true);
      const row = await setMemberXp(guildId, target.id, xp);

      await replyCard(
        interaction,
        successCard(t, t("levelconfig.xp_set", { user: target.tag, xp, level: row.level })),
        { ephemeral: true },
      );
    }
  },
};
