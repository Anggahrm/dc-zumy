import { Events } from "discord.js";
import { getAutoroleConfig } from "#services/autorole-store.js";
import { sendWelcomeGreeting } from "#services/greeter.js";
import { formatError } from "#utils/error.js";

async function resolveRole(guild, roleId) {
  const cached = guild.roles.cache.get(roleId);
  if (cached) return cached;
  return guild.roles.fetch(roleId).catch(() => null);
}

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const logger = member.client.zumy?.logger;
    let autoroleConfig = null;

    try {
      autoroleConfig = await getAutoroleConfig(member.guild.id);
    } catch (error) {
      const details = formatError(error);
      logger?.error("Failed to read autorole config", {
        guildId: member.guild.id,
        message: details.message,
      });
    }

    if (autoroleConfig) {
      const targetRoleIds = autoroleConfig.roles.filter((roleId) => !autoroleConfig.blacklist.includes(roleId));
      if (targetRoleIds.length > 0) {
        const assignableRoleIds = [];
        const skippedRoleIds = [];

        for (const roleId of targetRoleIds) {
          const role = await resolveRole(member.guild, roleId);
          if (!role || !role.editable) {
            skippedRoleIds.push(roleId);
            continue;
          }
          assignableRoleIds.push(roleId);
        }

        if (assignableRoleIds.length === 0) {
          logger?.warn("Autorole skipped: no assignable roles", {
            guildId: member.guild.id,
            userId: member.id,
            configured: targetRoleIds.length,
          });
        } else {
          try {
            await member.roles.add(assignableRoleIds, "Autorole configuration");
            logger?.info("Autorole applied", {
              guildId: member.guild.id,
              userId: member.id,
              assigned: assignableRoleIds,
              skipped: skippedRoleIds,
            });
          } catch (error) {
            const details = formatError(error);
            logger?.warn("Failed to apply autorole", {
              guildId: member.guild.id,
              userId: member.id,
              message: details.message,
              assignedCount: assignableRoleIds.length,
              skippedCount: skippedRoleIds.length,
            });
          }
        }
      }
    }

    try {
      await sendWelcomeGreeting(member, logger);
    } catch (error) {
      const details = formatError(error);
      logger?.warn("Greeter welcome handler failed", {
        guildId: member.guild.id,
        userId: member.id,
        message: details.message,
      });
    }
  },
};
