import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  addAutoroleBlacklist,
  addAutoroleRole,
  getAutoroleConfig,
  removeAutoroleBlacklist,
  removeAutoroleRole,
} from "#services/autorole.js";
import { createCard, replyCard } from "#utils/respond.js";

function formatRoleList(guild, roleIds) {
  if (roleIds.length === 0) return "- (none)";
  return roleIds
    .map((roleId) => {
      const role = guild.roles.cache.get(roleId);
      return role ? `- <@&${roleId}>` : `- \`${roleId}\` (deleted role)`;
    })
    .join("\n");
}

async function validateRoleForAutorole(guild, role) {
  if (role.id === guild.id) {
    return "The @everyone role cannot be used as an autorole.";
  }

  if (role.managed) {
    return "Managed/integration roles cannot be used as autoroles.";
  }

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    return "I couldn't verify my role permissions in this server.";
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "I need the **Manage Roles** permission to manage autoroles.";
  }

  if (role.position >= me.roles.highest.position) {
    return "I can't assign that role because it is equal to or higher than my highest role.";
  }

  return null;
}

function showConfigCard(guild, config) {
  return createCard({
    color: 0x3498db,
    title: "Autorole",
    body: [
      "**Current Settings**",
      "",
      "**Autorole list**",
      formatRoleList(guild, config.roles),
      "",
      "**Blacklist**",
      formatRoleList(guild, config.blacklist),
    ].join("\n"),
  });
}

function successCard(message) {
  return createCard({
    color: 0x57f287,
    title: "Autorole",
    body: message,
  });
}

function warningCard(message) {
  return createCard({
    color: 0xf1c40f,
    title: "Autorole",
    body: message,
  });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    admin: true,
  },
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Manage automatic role assignment")
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
        .setDescription("Show current autorole and blacklist config"),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for autorole command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const config = await getAutoroleConfig(guildId);
      await replyCard(interaction, showConfigCard(guild, config), { ephemeral: true });
      return;
    }

    const role = interaction.options.getRole("role", true);

    if (subcommand === "add") {
      const reason = await validateRoleForAutorole(guild, role);
      if (reason) {
        await replyCard(interaction, warningCard(reason), { ephemeral: true });
        return;
      }

      const config = await getAutoroleConfig(guildId);
      if (config.blacklist.includes(role.id)) {
        await replyCard(
          interaction,
          warningCard("That role is blacklisted. Use `/autorole unblacklist` first."),
          { ephemeral: true },
        );
        return;
      }

      const { added } = await addAutoroleRole(guildId, role.id);
      await replyCard(
        interaction,
        added
          ? successCard(`Role <@&${role.id}> has been added to autorole list.`)
          : warningCard(`Role <@&${role.id}> is already in autorole list.`),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const { removed } = await removeAutoroleRole(guildId, role.id);
      await replyCard(
        interaction,
        removed
          ? successCard(`Role <@&${role.id}> has been removed from autorole list.`)
          : warningCard(`Role <@&${role.id}> is not in autorole list.`),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "blacklist") {
      if (role.id === guild.id) {
        await replyCard(interaction, warningCard("The @everyone role cannot be blacklisted."), { ephemeral: true });
        return;
      }

      const { added, removedFromRoles } = await addAutoroleBlacklist(guildId, role.id);
      const lines = [];
      lines.push(
        added
          ? `Role <@&${role.id}> has been added to blacklist.`
          : `Role <@&${role.id}> is already blacklisted.`,
      );
      if (removedFromRoles) {
        lines.push("That role was removed from autorole list automatically.");
      }

      await replyCard(interaction, successCard(lines.join("\n")), { ephemeral: true });
      return;
    }

    if (subcommand === "unblacklist") {
      const { removed } = await removeAutoroleBlacklist(guildId, role.id);
      await replyCard(
        interaction,
        removed
          ? successCard(`Role <@&${role.id}> has been removed from blacklist.`)
          : warningCard(`Role <@&${role.id}> is not in blacklist.`),
        { ephemeral: true },
      );
    }
  },
};
