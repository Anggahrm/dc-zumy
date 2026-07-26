import { Events } from "discord.js";
import { getAutoroleConfig } from "#services/autorole.js";
import { recordCase } from "#services/cases.js";
import { sendWelcomeGreeting } from "#services/greeter.js";
import { checkJoin, getJoinguardConfig, isJoinguardActive } from "#services/joinguard.js";
import { sendGuildLog } from "#services/logging.js";
import { getModConfig } from "#services/mod-config.js";
import { dmModerationNotice } from "#utils/moderation.js";
import { formatError } from "#utils/error.js";
import { formatElapsedSince } from "#utils/time.js";

function formatOrdinal(value) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

async function resolveRole(guild, roleId) {
  const cached = guild.roles.cache.get(roleId);
  if (cached) return cached;
  return guild.roles.fetch(roleId).catch(() => null);
}

// Returns true when the member was removed (kick/ban) and the rest of the
// join flow should be skipped.
async function runJoinGuard(member, logger) {
  let config;
  try {
    config = await getJoinguardConfig(member.guild.id, { preferCache: true });
  } catch {
    return false;
  }
  if (!isJoinguardActive(config)) return false;

  const violation = checkJoin(config, member);
  if (!violation) return false;

  let action = config.action;
  let outcome = "alerted";

  if (action === "quarantine") {
    const { quarantineRoleId } = await getModConfig(member.guild.id).catch(() => ({ quarantineRoleId: null }));
    const role = quarantineRoleId ? member.guild.roles.cache.get(quarantineRoleId) : null;
    if (role) {
      const applied = await member.roles.add(role, `Join guard: ${violation.label}`).then(() => true).catch(() => false);
      outcome = applied ? "quarantined" : "quarantine failed";
    } else {
      action = "alert";
    }
  }

  if (action === "kick") {
    await dmModerationNotice(member.user, {
      guildName: member.guild.name,
      actionLabel: "Kick (join guard)",
      reason: violation.label,
    });
    const kicked = await member.kick(`Join guard: ${violation.label}`).then(() => true).catch(() => false);
    outcome = kicked ? "kicked" : "kick failed";
  } else if (action === "ban") {
    const banned = await member.guild.bans
      .create(member.id, { reason: `Join guard: ${violation.label}` })
      .then(() => true)
      .catch(() => false);
    outcome = banned ? "banned" : "ban failed";
  }

  if (["kicked", "banned", "quarantined"].includes(outcome)) {
    await recordCase({
      guild: member.guild,
      type: outcome === "banned" ? "auto-ban" : outcome === "kicked" ? "auto-kick" : "quarantine",
      target: member.user,
      moderator: member.client.user,
      reason: `Join guard: ${violation.label}`,
      metadata: { source: "joinguard", rule: violation.rule },
      logger,
    });
  }

  await sendGuildLog({
    guild: member.guild,
    eventKey: "automod",
    title: "Join Guard",
    color: 0xe67e22,
    lines: [
      `- Member: **${member.user.tag}**`,
      `- User ID: \`${member.id}\``,
      `- Rule: ${violation.label}`,
      `- Action: ${outcome}`,
    ],
    actorId: member.id,
    actorName: member.user.tag,
    actorAvatarUrl: member.user.displayAvatarURL({ extension: "png", size: 128 }),
    actorAvatarDescription: `${member.user.tag} avatar`,
    logger,
  });

  return outcome === "kicked" || outcome === "banned";
}

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const logger = member.client.zumy?.logger;

    try {
      const removed = await runJoinGuard(member, logger);
      if (removed) return;
    } catch (error) {
      const details = formatError(error);
      logger?.warn("Join guard failed", {
        guildId: member.guild.id,
        userId: member.id,
        message: details.message,
      });
    }

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

    await sendGuildLog({
      guild: member.guild,
      eventKey: "joins",
      title: "Member Joined",
      color: 0x57f287,
      lines: [
        `- <@${member.id}> ${formatOrdinal(member.guild.memberCount)} to join`,
        `- created ${formatElapsedSince(member.user.createdTimestamp)} ago`,
      ],
      actorId: member.id,
      actorName: member.user.tag,
      actorAvatarUrl: member.user.displayAvatarURL({ extension: "png", size: 128 }),
      actorAvatarDescription: `${member.user.tag} avatar`,
      logger,
    });
  },
};
