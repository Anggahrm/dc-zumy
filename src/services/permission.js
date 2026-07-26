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
      return { ok: false, reason: "This one is owner-only." };
    }

    if (permission.guildOnly && !interaction.inGuild()) {
      return { ok: false, reason: "This command only works in a server." };
    }

    if (permission.admin) {
      const memberPerms = interaction.memberPermissions;
      if (!memberPerms || !memberPerms.has(PermissionFlagsBits.Administrator)) {
        return { ok: false, reason: "You need Administrator permission for this command." };
      }
    }

    if (Array.isArray(permission.member) && permission.member.length > 0) {
      const memberPerms = interaction.memberPermissions;
      if (!memberPerms) {
        return { ok: false, reason: "I couldn't resolve your permissions here." };
      }

      for (const flag of permission.member) {
        if (!memberPerms.has(flag)) {
          return {
            ok: false,
            reason: `You need the **${formatFlagName(flag)}** permission for this command.`,
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
