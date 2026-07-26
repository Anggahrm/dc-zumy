import { PermissionFlagsBits } from "discord.js";

const FLAG_NAMES = new Map(Object.entries(PermissionFlagsBits).map(([name, bit]) => [bit, name]));

function formatFlagName(flag) {
  const name = FLAG_NAMES.get(flag) ?? "required";
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function createPermissionService({ owners }) {
  function isOwner(userId) {
    return owners.includes(userId);
  }

  function hasAccess(interaction, permission = {}) {
    if (permission.owner && !isOwner(interaction.user.id)) {
      return { ok: false, reasonKey: "perm.owner_only" };
    }

    if (permission.guildOnly && !interaction.inGuild()) {
      return { ok: false, reasonKey: "perm.guild_only" };
    }

    if (permission.admin) {
      const memberPerms = interaction.memberPermissions;
      if (!memberPerms || !memberPerms.has(PermissionFlagsBits.Administrator)) {
        return { ok: false, reasonKey: "perm.admin_needed" };
      }
    }

    if (Array.isArray(permission.member) && permission.member.length > 0) {
      const memberPerms = interaction.memberPermissions;
      if (!memberPerms) {
        return { ok: false, reasonKey: "perm.unresolved" };
      }

      for (const flag of permission.member) {
        if (!memberPerms.has(flag)) {
          return {
            ok: false,
            reasonKey: "perm.member_perm",
            reasonVars: { permission: formatFlagName(flag) },
          };
        }
      }
    }

    return { ok: true };
  }

  return {
    hasAccess,
    isOwner,
  };
}
