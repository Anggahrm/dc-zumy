import { Events, PermissionFlagsBits } from "discord.js";
import { checkMessage, getAutomodConfig, isAutomodActive, isExemptFromAutomod } from "#services/automod.js";
import { recordCase } from "#services/cases.js";
import { applyWarnEscalation } from "#services/escalation.js";
import {
  addMemberXp,
  applyLevelRewards,
  getLevelsConfig,
  isOnXpCooldown,
  randomXp,
  renderLevelUpMessage,
} from "#services/levels.js";
import { sendGuildLog } from "#services/logging.js";
import { getTriggers, renderTriggerResponse, resolveTrigger } from "#services/triggers.js";
import { addWarning } from "#services/warnings.js";
import { formatError } from "#utils/error.js";

function isModExempt(message) {
  const member = message.member;
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageMessages);
}

async function applyAction({ message, config, violation, logger }) {
  const guild = message.guild;
  const action = config.actions[violation.rule] ?? "delete";
  const outcomes = [];

  try {
    await message.delete();
    outcomes.push("message deleted");
  } catch (error) {
    const details = formatError(error);
    logger?.warn("Automod delete failed", {
      guildId: guild.id,
      channelId: message.channelId,
      messageId: message.id,
      rule: violation.rule,
      message: details.message,
    });
    outcomes.push("delete failed (missing permission)");
  }

  if (action === "warn") {
    try {
      const { count } = await addWarning(guild.id, message.author.id, {
        moderatorId: guild.client.user.id,
        reason: `Automod: ${violation.label}`,
      });
      outcomes.push(`warned (total ${count})`);

      await recordCase({
        guild,
        type: "warn",
        target: message.author,
        moderator: guild.client.user,
        reason: `Automod: ${violation.label}`,
        metadata: { source: "automod", totalWarnings: count },
        logger,
      });

      const escalated = await applyWarnEscalation({
        guild,
        user: message.author,
        warningCount: count,
        logger,
      });
      if (escalated) {
        outcomes.push(`escalated: ${escalated}`);
      }
    } catch (error) {
      logger?.warn("Automod warn failed", {
        guildId: guild.id,
        userId: message.author.id,
        message: error?.message || String(error),
      });
    }
  }

  if (action === "timeout") {
    const member = message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));
    if (member?.moderatable) {
      try {
        await member.timeout(config.timeoutMinutes * 60 * 1000, `Automod: ${violation.label}`);
        outcomes.push(`timed out for ${config.timeoutMinutes}m`);

        await recordCase({
          guild,
          type: "timeout",
          target: message.author,
          moderator: guild.client.user,
          reason: `Automod: ${violation.label}`,
          metadata: { source: "automod", duration: `${config.timeoutMinutes}m` },
          logger,
        });
      } catch {
        outcomes.push("timeout failed");
      }
    } else {
      outcomes.push("timeout skipped (not moderatable)");
    }
  }

  return outcomes;
}

// Returns true when the message violated a rule and was actioned (so later
// steps like XP should be skipped).
async function runAutomod(message, logger) {
  let config;
  try {
    config = await getAutomodConfig(message.guild.id, { preferCache: true });
  } catch (error) {
    const details = formatError(error);
    logger?.warn("Automod config read failed", {
      guildId: message.guild.id,
      message: details.message,
    });
    return false;
  }

  if (!isAutomodActive(config)) return false;
  if (isModExempt(message)) return false;
  if (
    isExemptFromAutomod(config, {
      channelId: message.channelId,
      parentChannelId: message.channel?.parentId ?? null,
      roleIds: message.member ? [...message.member.roles.cache.keys()] : [],
    })
  ) {
    return false;
  }

  const violation = checkMessage(config, message);
  if (!violation) return false;

  const outcomes = await applyAction({ message, config, violation, logger });

  await sendGuildLog({
    guild: message.guild,
    eventKey: "automod",
    title: "Automod Action",
    color: 0xe67e22,
    lines: [
      `- Member: **${message.author.tag}**`,
      `- User ID: \`${message.author.id}\``,
      `- Channel: <#${message.channelId}>`,
      `- Rule: ${violation.label}`,
      `- Action: ${outcomes.join(", ")}`,
    ],
    actorId: message.author.id,
    actorName: message.author.tag,
    actorAvatarUrl: message.author.displayAvatarURL({ extension: "png", size: 128 }),
    actorAvatarDescription: `${message.author.tag} avatar`,
    logger,
  });
  return true;
}

async function awardXp(message, logger) {
  const guild = message.guild;

  let config;
  try {
    config = await getLevelsConfig(guild.id, { preferCache: true });
  } catch {
    return;
  }
  if (!config.enabled) return;
  if (config.noXpChannels.includes(message.channelId)) return;
  if (message.channel?.parentId && config.noXpChannels.includes(message.channel.parentId)) return;

  const member = message.member;
  if (member && config.noXpRoles.some((roleId) => member.roles.cache.has(roleId))) return;
  if (isOnXpCooldown(guild.id, message.author.id, config.cooldownSeconds)) return;

  let result;
  try {
    result = await addMemberXp(guild.id, message.author.id, randomXp(config));
  } catch (error) {
    logger?.warn("XP award failed", {
      guildId: guild.id,
      userId: message.author.id,
      message: error?.message || String(error),
    });
    return;
  }

  if (!result.leveledUp) return;

  if (member) {
    await applyLevelRewards({ guild, member, config, level: result.level, logger });
  }

  if (config.announce) {
    const text = renderLevelUpMessage(config.levelUpMessage, {
      member: member ?? { id: message.author.id, user: message.author },
      level: result.level,
      guild,
    });

    const channel = config.announceChannelId
      ? guild.channels.cache.get(config.announceChannelId) ?? message.channel
      : message.channel;

    if (channel?.isTextBased() && typeof channel.send === "function") {
      await channel
        .send({
          content: text,
          allowedMentions: { users: [message.author.id] },
        })
        .catch(() => {});
    }
  }
}

async function runTriggers(message) {
  if (!message.content?.trim()) return;

  let triggers;
  try {
    triggers = await getTriggers(message.guild.id, { preferCache: true });
  } catch {
    return;
  }
  if (Object.keys(triggers).length === 0) return;

  const hit = resolveTrigger(triggers, {
    guildId: message.guild.id,
    channelId: message.channelId,
    parentChannelId: message.channel?.parentId ?? null,
    content: message.content,
  });
  if (!hit) return;

  await message
    .reply({
      content: renderTriggerResponse(hit.trigger.response, { message, guild: message.guild }),
      allowedMentions: { users: [message.author.id], repliedUser: false },
    })
    .catch(() => {});
}

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author?.bot || message.system) return;

    const logger = message.client.zumy?.logger;

    const violated = await runAutomod(message, logger);
    if (violated) return;

    await runTriggers(message);
    await awardXp(message, logger);
  },
};
