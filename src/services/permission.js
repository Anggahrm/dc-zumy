import { PermissionFlagsBits } from "discord.js";

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

    return { ok: true };
  }

  return {
    hasAccess,
    isOwner,
  };
}
