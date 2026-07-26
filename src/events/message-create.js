import { Events, PermissionFlagsBits } from "discord.js";
import { checkMessage, getAutomodConfig, isAutomodActive, isExemptFromAutomod } from "#services/automod.js";
import { recordCase } from "#services/cases.js";
import { applyWarnEscalation } from "#services/escalation.js";
import { sendGuildLog } from "#services/logging.js";
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

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author?.bot || message.system) return;

    const logger = message.client.zumy?.logger;

    let config;
    try {
      config = await getAutomodConfig(message.guild.id, { preferCache: true });
    } catch (error) {
      const details = formatError(error);
      logger?.warn("Automod config read failed", {
        guildId: message.guild.id,
        message: details.message,
      });
      return;
    }

    if (!isAutomodActive(config)) return;
    if (isModExempt(message)) return;
    if (
      isExemptFromAutomod(config, {
        channelId: message.channelId,
        parentChannelId: message.channel?.parentId ?? null,
        roleIds: message.member ? [...message.member.roles.cache.keys()] : [],
      })
    ) {
      return;
    }

    const violation = checkMessage(config, message);
    if (!violation) return;

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
  },
};
