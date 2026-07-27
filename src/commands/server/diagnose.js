import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getAutoroleConfig } from "#services/autorole.js";
import { getBirthdaysConfig } from "#services/birthdays.js";
import { getGreeterConfig } from "#services/greeter.js";
import { registerStrings } from "#services/i18n.js";
import { getLevelsConfig } from "#services/levels.js";
import { getLoggingConfig } from "#services/logging.js";
import { getModConfig } from "#services/mod-config.js";
import { getMenus } from "#services/rolemenus.js";
import { getStarboardConfig } from "#services/starboard.js";
import { getSuggestionsConfig } from "#services/suggestions.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("diagnose", {
  en: {
    title: "Diagnose",
    title_issues: "Diagnose — issues found",
    title_healthy: "Diagnose — all healthy",
    no_member_object: "I couldn't resolve my own member object.",
    bot_permissions_header: "**Bot permissions**",
    perms_all_granted: "✅ All critical permissions granted",
    perms_missing: "❌ Missing: {list}",
    highest_role_line: "- My highest role: <@&{role_id}> (position {position})",
    channels_header: "**Channels**",
    roles_header: "**Roles**",
    line_unset: "▫️ {label}: not configured",
    channel_missing: "❌ {label}: configured channel no longer exists — {hint}",
    channel_no_send: "❌ {label}: I can't send messages in <#{channel_id}>",
    channel_ok: "✅ {label}: <#{channel_id}>",
    role_missing: "❌ {label}: configured role no longer exists — {hint}",
    role_too_high: "❌ {label}: <@&{role_id}> is above my highest role",
    role_ok: "✅ {label}: <@&{role_id}>",
    label_log_channel: "Log channel",
    label_welcome_channel: "Welcome channel",
    label_leave_channel: "Leave channel",
    label_starboard: "Starboard",
    label_suggestions: "Suggestions",
    label_birthdays: "Birthdays",
    label_mute_role: "Mute role",
    label_quarantine_role: "Quarantine role",
    label_birthday_role: "Birthday role",
    hint_log_channel: "re-run `/log channel`",
    hint_welcome_channel: "re-run `/set welcome`",
    hint_leave_channel: "re-run `/set leave`",
    hint_starboard: "re-run `/starboard channel`",
    hint_suggestions: "re-run `/suggestion channel`",
    hint_birthdays: "re-run `/birthday channel`",
    hint_mute_role: "re-run `/muterole set|create`",
    hint_quarantine_role: "re-run `/quarantine role`",
    hint_birthday_role: "re-run `/birthday role`",
    autorole_ok: "✅ Autorole: all {count} role(s) assignable",
    autorole_broken: "❌ Autorole: {count} unassignable role(s) — fix with `/autorole remove`",
    rewards_ok: "✅ Level rewards: all {count} role(s) assignable",
    rewards_broken: "❌ Level rewards: {count} broken (levels {levels}) — fix with `/levelconfig reward-remove`",
    menus_ok: "✅ Role menus: all {count} menu(s) healthy",
    menus_broken: "❌ Role menus with broken roles: {menus} — repost after fixing",
  },
  id: {
    title: "Diagnosa",
    title_issues: "Diagnosa — ada masalah",
    title_healthy: "Diagnosa — semua sehat",
    no_member_object: "Aku tidak bisa membaca data member-ku sendiri.",
    bot_permissions_header: "**Permission bot**",
    perms_all_granted: "✅ Semua permission penting sudah diberikan",
    perms_missing: "❌ Kurang: {list}",
    highest_role_line: "- Role tertinggiku: <@&{role_id}> (posisi {position})",
    channels_header: "**Channel**",
    roles_header: "**Role**",
    line_unset: "▫️ {label}: belum diatur",
    channel_missing: "❌ {label}: channel yang diatur sudah tidak ada — {hint}",
    channel_no_send: "❌ {label}: aku tidak bisa kirim pesan di <#{channel_id}>",
    channel_ok: "✅ {label}: <#{channel_id}>",
    role_missing: "❌ {label}: role yang diatur sudah tidak ada — {hint}",
    role_too_high: "❌ {label}: <@&{role_id}> ada di atas role tertinggiku",
    role_ok: "✅ {label}: <@&{role_id}>",
    label_log_channel: "Channel log",
    label_welcome_channel: "Channel welcome",
    label_leave_channel: "Channel leave",
    label_starboard: "Starboard",
    label_suggestions: "Saran",
    label_birthdays: "Ulang Tahun",
    label_mute_role: "Role mute",
    label_quarantine_role: "Role quarantine",
    label_birthday_role: "Role ulang tahun",
    hint_log_channel: "jalankan ulang `/log channel`",
    hint_welcome_channel: "jalankan ulang `/set welcome`",
    hint_leave_channel: "jalankan ulang `/set leave`",
    hint_starboard: "jalankan ulang `/starboard channel`",
    hint_suggestions: "jalankan ulang `/suggestion channel`",
    hint_birthdays: "jalankan ulang `/birthday channel`",
    hint_mute_role: "jalankan ulang `/muterole set|create`",
    hint_quarantine_role: "jalankan ulang `/quarantine role`",
    hint_birthday_role: "jalankan ulang `/birthday role`",
    autorole_ok: "✅ Autorole: semua {count} role bisa diberikan",
    autorole_broken: "❌ Autorole: {count} role tidak bisa diberikan — perbaiki dengan `/autorole remove`",
    rewards_ok: "✅ Reward level: semua {count} role bisa diberikan",
    rewards_broken: "❌ Reward level: {count} rusak (level {levels}) — perbaiki dengan `/levelconfig reward-remove`",
    menus_ok: "✅ Role menu: semua {count} menu sehat",
    menus_broken: "❌ Role menu dengan role rusak: {menus} — post ulang setelah diperbaiki",
  },
});

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

function channelLine(t, label, result, hint) {
  if (result.state === "unset") return t("diagnose.line_unset", { label });
  if (result.state === "missing") return t("diagnose.channel_missing", { label, hint });
  if (result.state === "no-send") return t("diagnose.channel_no_send", { label, channel_id: result.channel.id });
  return t("diagnose.channel_ok", { label, channel_id: result.channel.id });
}

function roleLine(t, label, result, hint) {
  if (result.state === "unset") return t("diagnose.line_unset", { label });
  if (result.state === "missing") return t("diagnose.role_missing", { label, hint });
  if (result.state === "too-high") return t("diagnose.role_too_high", { label, role_id: result.role.id });
  return t("diagnose.role_ok", { label, role_id: result.role.id });
}

export default {
  category: "server",
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
        createCard({ color: 0xed4245, title: ctx.t("diagnose.title"), body: ctx.t("diagnose.no_member_object") }),
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

    lines.push(ctx.t("diagnose.bot_permissions_header"));
    lines.push(
      missingPerms.length === 0
        ? ctx.t("diagnose.perms_all_granted")
        : ctx.t("diagnose.perms_missing", { list: missingPerms.map((p) => `**${p}**`).join(", ") }),
    );
    lines.push(ctx.t("diagnose.highest_role_line", { role_id: me.roles.highest.id, position: me.roles.highest.position }));
    lines.push("");

    lines.push(ctx.t("diagnose.channels_header"));
    lines.push(channelLine(ctx.t, ctx.t("diagnose.label_log_channel"), checkChannel(guild, logging?.channelId, me), ctx.t("diagnose.hint_log_channel")));
    lines.push(channelLine(ctx.t, ctx.t("diagnose.label_welcome_channel"), checkChannel(guild, greeter?.welcomeChannelId, me), ctx.t("diagnose.hint_welcome_channel")));
    lines.push(channelLine(ctx.t, ctx.t("diagnose.label_leave_channel"), checkChannel(guild, greeter?.leaveChannelId, me), ctx.t("diagnose.hint_leave_channel")));
    lines.push(channelLine(ctx.t, ctx.t("diagnose.label_starboard"), checkChannel(guild, starboard?.channelId, me), ctx.t("diagnose.hint_starboard")));
    lines.push(channelLine(ctx.t, ctx.t("diagnose.label_suggestions"), checkChannel(guild, suggestions?.channelId, me), ctx.t("diagnose.hint_suggestions")));
    lines.push(channelLine(ctx.t, ctx.t("diagnose.label_birthdays"), checkChannel(guild, birthdays?.channelId, me), ctx.t("diagnose.hint_birthdays")));
    lines.push("");

    lines.push(ctx.t("diagnose.roles_header"));
    lines.push(roleLine(ctx.t, ctx.t("diagnose.label_mute_role"), checkRole(guild, modConfig?.muteRoleId, me), ctx.t("diagnose.hint_mute_role")));
    lines.push(roleLine(ctx.t, ctx.t("diagnose.label_quarantine_role"), checkRole(guild, modConfig?.quarantineRoleId, me), ctx.t("diagnose.hint_quarantine_role")));
    lines.push(roleLine(ctx.t, ctx.t("diagnose.label_birthday_role"), checkRole(guild, birthdays?.roleId, me), ctx.t("diagnose.hint_birthday_role")));

    const badAutoroles = (autorole?.roles ?? []).filter((roleId) => checkRole(guild, roleId, me).state !== "ok");
    if ((autorole?.roles ?? []).length > 0) {
      lines.push(
        badAutoroles.length === 0
          ? ctx.t("diagnose.autorole_ok", { count: autorole.roles.length })
          : ctx.t("diagnose.autorole_broken", { count: badAutoroles.length }),
      );
    }

    const badRewards = (levels?.rewards ?? []).filter((reward) => checkRole(guild, reward.roleId, me).state !== "ok");
    if ((levels?.rewards ?? []).length > 0) {
      lines.push(
        badRewards.length === 0
          ? ctx.t("diagnose.rewards_ok", { count: levels.rewards.length })
          : ctx.t("diagnose.rewards_broken", { count: badRewards.length, levels: badRewards.map((r) => r.level).join(", ") }),
      );
    }

    const menuEntries = Object.entries(menus ?? {});
    if (menuEntries.length > 0) {
      const broken = menuEntries.filter(([, menu]) =>
        menu.roles.some((roleId) => checkRole(guild, roleId, me).state !== "ok"));
      lines.push(
        broken.length === 0
          ? ctx.t("diagnose.menus_ok", { count: menuEntries.length })
          : ctx.t("diagnose.menus_broken", { menus: broken.map(([name]) => `\`${name}\``).join(", ") }),
      );
    }

    const hasProblem = lines.some((line) => line.startsWith("❌"));
    await replyCard(
      interaction,
      createCard({
        color: hasProblem ? 0xf1c40f : 0x57f287,
        title: hasProblem ? ctx.t("diagnose.title_issues") : ctx.t("diagnose.title_healthy"),
        body: lines.join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
