import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  addAutoroleBlacklist,
  addAutoroleRole,
  getAutoroleConfig,
  removeAutoroleBlacklist,
  removeAutoroleRole,
} from "#services/autorole.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("autorole", {
  en: {
    title: "Autorole",
    none_line: "- (none)",
    deleted_role_line: "- `{roleId}` (deleted role)",
    everyone_not_allowed: "The @everyone role can't be used as an autorole.",
    managed_not_allowed: "Roles managed by an integration (like bot roles) can't be autoroles.",
    perms_unverified: "I couldn't check my role permissions in this server.",
    need_manage_roles: "I need the **Manage Roles** permission to manage autoroles.",
    role_too_high: "I can't assign that role because it is equal to or higher than my highest role.",
    current_settings_header: "**Current Settings**",
    autorole_list_header: "**Autorole list**",
    blacklist_header: "**Blacklist**",
    role_blacklisted: "That role is blacklisted. Use `/autorole unblacklist` first.",
    role_added: "Role <@&{role}> added — new members will get it automatically.",
    role_already_added: "Role <@&{role}> is already in the autorole list.",
    role_removed: "Role <@&{role}> removed from the autorole list.",
    role_not_in_list: "Role <@&{role}> isn't in the autorole list.",
    everyone_no_blacklist: "The @everyone role can't be blacklisted.",
    blacklist_added: "Role <@&{role}> added to the blacklist.",
    blacklist_already: "Role <@&{role}> is already blacklisted.",
    blacklist_autoremoved_note: "That role was also removed from the autorole list automatically.",
    blacklist_removed: "Role <@&{role}> removed from the blacklist.",
    blacklist_not_found: "Role <@&{role}> isn't on the blacklist.",
  },
  id: {
    title: "Autorole",
    none_line: "- (kosong)",
    deleted_role_line: "- `{roleId}` (role terhapus)",
    everyone_not_allowed: "Role @everyone tidak bisa dipakai sebagai autorole.",
    managed_not_allowed: "Role yang dikelola integrasi (seperti role bot) tidak bisa jadi autorole.",
    perms_unverified: "Aku tidak bisa memeriksa permission role-ku di server ini.",
    need_manage_roles: "Aku butuh permission **Manage Roles** untuk mengatur autorole.",
    role_too_high: "Aku tidak bisa memberikan role itu karena posisinya sama atau lebih tinggi dari role tertinggiku.",
    current_settings_header: "**Pengaturan Saat Ini**",
    autorole_list_header: "**Daftar autorole**",
    blacklist_header: "**Blacklist**",
    role_blacklisted: "Role itu masuk blacklist. Pakai `/autorole unblacklist` dulu ya.",
    role_added: "Role <@&{role}> ditambahkan — member baru akan otomatis mendapatkannya.",
    role_already_added: "Role <@&{role}> sudah ada di daftar autorole.",
    role_removed: "Role <@&{role}> dihapus dari daftar autorole.",
    role_not_in_list: "Role <@&{role}> tidak ada di daftar autorole.",
    everyone_no_blacklist: "Role @everyone tidak bisa dimasukkan ke blacklist.",
    blacklist_added: "Role <@&{role}> ditambahkan ke blacklist.",
    blacklist_already: "Role <@&{role}> sudah ada di blacklist.",
    blacklist_autoremoved_note: "Role itu juga otomatis dihapus dari daftar autorole.",
    blacklist_removed: "Role <@&{role}> dihapus dari blacklist.",
    blacklist_not_found: "Role <@&{role}> tidak ada di blacklist.",
  },
});

function formatRoleList(t, guild, roleIds) {
  if (roleIds.length === 0) return t("autorole.none_line");
  return roleIds
    .map((roleId) => {
      const role = guild.roles.cache.get(roleId);
      return role ? `- <@&${roleId}>` : t("autorole.deleted_role_line", { roleId });
    })
    .join("\n");
}

async function validateRoleForAutorole(t, guild, role) {
  if (role.id === guild.id) {
    return t("autorole.everyone_not_allowed");
  }

  if (role.managed) {
    return t("autorole.managed_not_allowed");
  }

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    return t("autorole.perms_unverified");
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return t("autorole.need_manage_roles");
  }

  if (role.position >= me.roles.highest.position) {
    return t("autorole.role_too_high");
  }

  return null;
}

function showConfigCard(t, guild, config) {
  return createCard({
    color: 0x3498db,
    title: t("autorole.title"),
    body: [
      t("autorole.current_settings_header"),
      "",
      t("autorole.autorole_list_header"),
      formatRoleList(t, guild, config.roles),
      "",
      t("autorole.blacklist_header"),
      formatRoleList(t, guild, config.blacklist),
    ].join("\n"),
  });
}

function successCard(t, message) {
  return createCard({
    color: 0x57f287,
    title: t("autorole.title"),
    body: message,
  });
}

function warningCard(t, message) {
  return createCard({
    color: 0xf1c40f,
    title: t("autorole.title"),
    body: message,
  });
}

export default {
  category: "roles",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageRoles],
  },
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Manage automatic role assignment")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a role to autorole list")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to add")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a role from autorole list")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to remove")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("blacklist")
        .setDescription("Blacklist a role from being autorole")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to blacklist")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unblacklist")
        .setDescription("Remove a role from blacklist")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to unblacklist")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show the autorole list and blacklist"),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for autorole command.");
    }

    const t = ctx.t;
    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const config = await getAutoroleConfig(guildId);
      await replyCard(interaction, showConfigCard(t, guild, config), { ephemeral: true });
      return;
    }

    const role = interaction.options.getRole("role", true);

    if (subcommand === "add") {
      const reason = await validateRoleForAutorole(t, guild, role);
      if (reason) {
        await replyCard(interaction, warningCard(t, reason), { ephemeral: true });
        return;
      }

      const config = await getAutoroleConfig(guildId);
      if (config.blacklist.includes(role.id)) {
        await replyCard(
          interaction,
          warningCard(t, t("autorole.role_blacklisted")),
          { ephemeral: true },
        );
        return;
      }

      const { added } = await addAutoroleRole(guildId, role.id);
      await replyCard(
        interaction,
        added
          ? successCard(t, t("autorole.role_added", { role: role.id }))
          : warningCard(t, t("autorole.role_already_added", { role: role.id })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const { removed } = await removeAutoroleRole(guildId, role.id);
      await replyCard(
        interaction,
        removed
          ? successCard(t, t("autorole.role_removed", { role: role.id }))
          : warningCard(t, t("autorole.role_not_in_list", { role: role.id })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "blacklist") {
      if (role.id === guild.id) {
        await replyCard(interaction, warningCard(t, t("autorole.everyone_no_blacklist")), { ephemeral: true });
        return;
      }

      const { added, removedFromRoles } = await addAutoroleBlacklist(guildId, role.id);
      const lines = [];
      lines.push(
        added
          ? t("autorole.blacklist_added", { role: role.id })
          : t("autorole.blacklist_already", { role: role.id }),
      );
      if (removedFromRoles) {
        lines.push(t("autorole.blacklist_autoremoved_note"));
      }

      await replyCard(interaction, successCard(t, lines.join("\n")), { ephemeral: true });
      return;
    }

    if (subcommand === "unblacklist") {
      const { removed } = await removeAutoroleBlacklist(guildId, role.id);
      await replyCard(
        interaction,
        removed
          ? successCard(t, t("autorole.blacklist_removed", { role: role.id }))
          : warningCard(t, t("autorole.blacklist_not_found", { role: role.id })),
        { ephemeral: true },
      );
    }
  },
};
