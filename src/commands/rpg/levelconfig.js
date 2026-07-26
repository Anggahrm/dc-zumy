import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getLevelsConfig, MAX_LEVEL_REWARDS, setMemberXp, updateLevelsConfig } from "#services/levels.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Leveling", body });
}

function warningCard(body) {
  return createCard({ color: 0xf1c40f, title: "Leveling", body });
}

function formatList(values, formatter) {
  return values.length > 0 ? values.map(formatter).join(", ") : "(none)";
}

function configCard(config) {
  const rewards = config.rewards.length > 0
    ? config.rewards.map((reward) => `- Level ${reward.level} → <@&${reward.roleId}>`).join("\n")
    : "- (none)";

  return createCard({
    color: 0x3498db,
    title: "Leveling",
    body: [
      "**Current settings**",
      `${config.enabled ? "✅" : "❌"} Leveling ${config.enabled ? "enabled" : "disabled"}`,
      `- XP per message: **${config.xpMin}-${config.xpMax}** (multiplier x${config.multiplier})`,
      `- Cooldown: **${config.cooldownSeconds}s**`,
      `- Level-up announce: ${config.announce ? (config.announceChannelId ? `in <#${config.announceChannelId}>` : "in the same channel") : "off"}`,
      `- Level-up message: ${config.levelUpMessage ?? "(default)"}`,
      `- Reward mode: **${config.stackRewards ? "stack" : "replace"}**`,
      "",
      "**No-XP channels**",
      `- ${formatList(config.noXpChannels, (id) => `<#${id}>`)}`,
      "**No-XP roles**",
      `- ${formatList(config.noXpRoles, (id) => `<@&${id}>`)}`,
      "",
      `**Role rewards** (${config.rewards.length}/${MAX_LEVEL_REWARDS})`,
      rewards,
    ].join("\n"),
  });
}

export default {
  category: "rpg",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("levelconfig")
    .setDescription("Configure server leveling")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("show").setDescription("Show leveling settings"))
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Enable or disable leveling")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Enable leveling").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("rate")
        .setDescription("Tune XP amounts and cooldown")
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
        .setDescription("Configure level-up announcements")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Announce level-ups").setRequired(true),
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
            .setDescription("Template: {user} {username} {level} {server} (empty = default)")
            .setMaxLength(300)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("no-xp-channel")
        .setDescription("Toggle a channel's XP gain")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to toggle")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("no-xp-role")
        .setDescription("Toggle a role's XP gain")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to toggle").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reward-add")
        .setDescription("Grant a role at a level")
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
          option.setName("enabled").setDescription("true = keep all earned roles, false = only highest").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("xp-set")
        .setDescription("Set a member's XP (admin correction)")
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

    if (subcommand === "show") {
      const config = await getLevelsConfig(guildId);
      await replyCard(interaction, configCard(config), { ephemeral: true });
      return;
    }

    if (subcommand === "toggle") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await updateLevelsConfig(guildId, (config) => {
        config.enabled = enabled;
      });
      await replyCard(
        interaction,
        successCard(`Leveling is now ${enabled ? "✅ enabled" : "❌ disabled"}.`),
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
          `XP rate: **${config.xpMin}-${config.xpMax}** per message, cooldown **${config.cooldownSeconds}s**, multiplier **x${config.multiplier}**.`,
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
        successCard([
          `Level-up announcements ${config.announce ? "✅ enabled" : "❌ disabled"}.`,
          ...(config.announce
            ? [
              `- Where: ${config.announceChannelId ? `<#${config.announceChannelId}>` : "same channel as the message"}`,
              `- Message: ${config.levelUpMessage ?? "(default)"}`,
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
        successCard(`<#${channel.id}> ${result ? "no longer gives" : "now gives"} XP.`),
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
        successCard(`Members with <@&${role.id}> ${result ? "no longer gain" : "now gain"} XP.`),
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
          warningCard("That role can't be used (managed, @everyone, or above my highest role)."),
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
          ? warningCard(`Reward list is full (max ${MAX_LEVEL_REWARDS}).`)
          : successCard(`Level **${level}** now rewards <@&${role.id}>.`),
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
        result ? successCard(`Reward for level **${level}** removed.`) : warningCard("No reward at that level."),
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
        successCard(enabled ? "Rewards now **stack** (members keep all earned roles)." : "Rewards now **replace** (only the highest earned role is kept)."),
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
        successCard(`**${target.tag}** set to **${xp}** XP (level **${row.level}**).`),
        { ephemeral: true },
      );
    }
  },
};
