import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getAutoroleConfig } from "#services/autorole.js";
import { getBirthdaysConfig } from "#services/birthdays.js";
import { getGreeterConfig } from "#services/greeter.js";
import { getLevelsConfig } from "#services/levels.js";
import { getLoggingConfig } from "#services/logging.js";
import { getModConfig } from "#services/mod-config.js";
import { getMenus } from "#services/rolemenus.js";
import { getStarboardConfig } from "#services/starboard.js";
import { getSuggestionsConfig } from "#services/suggestions.js";
import { createCard, replyCard } from "#utils/respond.js";

const CRITICAL_PERMISSIONS = [
  ["Manage Roles", PermissionFlagsBits.ManageRoles],
  ["Manage Channels", PermissionFlagsBits.ManageChannels],
  ["Manage Messages", PermissionFlagsBits.ManageMessages],
  ["Kick Members", PermissionFlagsBits.KickMembers],
  ["Ban Members", PermissionFlagsBits.BanMembers],
  ["Moderate Members", PermissionFlagsBits.ModerateMembers],
  ["View Audit Log", PermissionFlagsBits.ViewAuditLog],
  ["Manage Server (invite tracking)", PermissionFlagsBits.ManageGuild],
];

function checkChannel(guild, channelId, me) {
  if (!channelId) return { state: "unset" };
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return { state: "missing" };
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.SendMessages) || !perms.has(PermissionFlagsBits.ViewChannel)) {
    return { state: "no-send", channel };
  }
  return { state: "ok", channel };
}

function checkRole(guild, roleId, me) {
  if (!roleId) return { state: "unset" };
  const role = guild.roles.cache.get(roleId);
  if (!role) return { state: "missing" };
  if (role.position >= me.roles.highest.position) return { state: "too-high", role };
  return { state: "ok", role };
}

function channelLine(label, result, hint) {
  if (result.state === "unset") return `▫️ ${label}: not configured`;
  if (result.state === "missing") return `❌ ${label}: configured channel no longer exists — ${hint}`;
  if (result.state === "no-send") return `❌ ${label}: I can't send messages in <#${result.channel.id}>`;
  return `✅ ${label}: <#${result.channel.id}>`;
}

function roleLine(label, result, hint) {
  if (result.state === "unset") return `▫️ ${label}: not configured`;
  if (result.state === "missing") return `❌ ${label}: configured role no longer exists — ${hint}`;
  if (result.state === "too-high") return `❌ ${label}: <@&${result.role.id}> is above my highest role`;
  return `✅ ${label}: <@&${result.role.id}>`;
}

export default {
  category: "utility",
  cooldown: 10,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("diagnose")
    .setDescription("Health-check the bot's permissions and feature configuration")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for diagnose command.");
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = ctx.guild ?? guild.id;
    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!me) {
      await replyCard(
        interaction,
        createCard({ color: 0xed4245, title: "Diagnose", body: "I couldn't resolve my own member object." }),
        { ephemeral: true },
      );
      return;
    }

    const missingPerms = CRITICAL_PERMISSIONS
      .filter(([, flag]) => !me.permissions.has(flag))
      .map(([label]) => label);

    const [logging, greeter, modConfig, starboard, suggestions, autorole, levels, birthdays, menus] = await Promise.all([
      getLoggingConfig(guildId).catch(() => null),
      getGreeterConfig(guildId).catch(() => null),
      getModConfig(guildId).catch(() => null),
      getStarboardConfig(guildId).catch(() => null),
      getSuggestionsConfig(guildId).catch(() => null),
      getAutoroleConfig(guildId).catch(() => null),
      getLevelsConfig(guildId).catch(() => null),
      getBirthdaysConfig(guildId).catch(() => null),
      getMenus(guildId).catch(() => null),
    ]);

    const lines = [];

    lines.push("**Bot permissions**");
    lines.push(
      missingPerms.length === 0
        ? "✅ All critical permissions granted"
        : `❌ Missing: ${missingPerms.map((p) => `**${p}**`).join(", ")}`,
    );
    lines.push(`- My highest role: <@&${me.roles.highest.id}> (position ${me.roles.highest.position})`);
    lines.push("");

    lines.push("**Channels**");
    lines.push(channelLine("Log channel", checkChannel(guild, logging?.channelId, me), "re-run `/log channel`"));
    lines.push(channelLine("Welcome channel", checkChannel(guild, greeter?.welcomeChannelId, me), "re-run `/set welcome`"));
    lines.push(channelLine("Leave channel", checkChannel(guild, greeter?.leaveChannelId, me), "re-run `/set leave`"));
    lines.push(channelLine("Starboard", checkChannel(guild, starboard?.channelId, me), "re-run `/starboard channel`"));
    lines.push(channelLine("Suggestions", checkChannel(guild, suggestions?.channelId, me), "re-run `/suggestion channel`"));
    lines.push(channelLine("Birthdays", checkChannel(guild, birthdays?.channelId, me), "re-run `/birthday channel`"));
    lines.push("");

    lines.push("**Roles**");
    lines.push(roleLine("Mute role", checkRole(guild, modConfig?.muteRoleId, me), "re-run `/muterole set|create`"));
    lines.push(roleLine("Quarantine role", checkRole(guild, modConfig?.quarantineRoleId, me), "re-run `/quarantine role`"));
    lines.push(roleLine("Birthday role", checkRole(guild, birthdays?.roleId, me), "re-run `/birthday role`"));

    const badAutoroles = (autorole?.roles ?? []).filter((roleId) => checkRole(guild, roleId, me).state !== "ok");
    if ((autorole?.roles ?? []).length > 0) {
      lines.push(
        badAutoroles.length === 0
          ? `✅ Autorole: all ${autorole.roles.length} role(s) assignable`
          : `❌ Autorole: ${badAutoroles.length} unassignable role(s) — fix with \`/autorole remove\``,
      );
    }

    const badRewards = (levels?.rewards ?? []).filter((reward) => checkRole(guild, reward.roleId, me).state !== "ok");
    if ((levels?.rewards ?? []).length > 0) {
      lines.push(
        badRewards.length === 0
          ? `✅ Level rewards: all ${levels.rewards.length} role(s) assignable`
          : `❌ Level rewards: ${badRewards.length} broken (levels ${badRewards.map((r) => r.level).join(", ")}) — fix with \`/levelconfig reward-remove\``,
      );
    }

    const menuEntries = Object.entries(menus ?? {});
    if (menuEntries.length > 0) {
      const broken = menuEntries.filter(([, menu]) =>
        menu.roles.some((roleId) => checkRole(guild, roleId, me).state !== "ok"));
      lines.push(
        broken.length === 0
          ? `✅ Role menus: all ${menuEntries.length} menu(s) healthy`
          : `❌ Role menus with broken roles: ${broken.map(([name]) => `\`${name}\``).join(", ")} — repost after fixing`,
      );
    }

    const hasProblem = lines.some((line) => line.startsWith("❌"));
    await replyCard(
      interaction,
      createCard({
        color: hasProblem ? 0xf1c40f : 0x57f287,
        title: hasProblem ? "Diagnose — issues found" : "Diagnose — all healthy",
        body: lines.join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
