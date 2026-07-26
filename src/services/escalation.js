import { getAutomodConfig } from "#services/automod.js";
import { recordCase } from "#services/cases.js";
import { dmModerationNotice } from "#utils/moderation.js";

// Applies the configured warn-count escalation ladder after a warning is
// issued. Triggers only when the count exactly hits a threshold so repeated
// warnings past a threshold don't re-punish. Returns a short description of
// the action taken, or null.
export async function applyWarnEscalation({ guild, user, warningCount, logger }) {
  const config = await getAutomodConfig(guild.id, { preferCache: true });
  const { timeoutAt, kickAt, banAt } = config.escalation;

  let action = null;
  if (banAt > 0 && warningCount === banAt) {
    action = "ban";
  } else if (kickAt > 0 && warningCount === kickAt) {
    action = "kick";
  } else if (timeoutAt > 0 && warningCount === timeoutAt) {
    action = "timeout";
  }

  if (!action) return null;

  const member = await guild.members.fetch(user.id).catch(() => null);
  const reason = `Warning escalation: reached ${warningCount} warning(s)`;

  try {
    if (action === "timeout") {
      if (!member?.moderatable) return null;
      await member.timeout(config.timeoutMinutes * 60 * 1000, reason);
    } else if (action === "kick") {
      if (!member?.kickable) return null;
      await dmModerationNotice(user, { guildName: guild.name, actionLabel: "Kick (escalation)", reason });
      await member.kick(reason);
    } else if (action === "ban") {
      if (member && !member.bannable) return null;
      await dmModerationNotice(user, {
        guildName: guild.name,
        actionLabel: "Ban (escalation)",
        color: 0xed4245,
        reason,
      });
      await guild.bans.create(user.id, { reason });
    }
  } catch (error) {
    logger?.warn("Warn escalation failed", {
      guildId: guild.id,
      userId: user.id,
      action,
      message: error?.message || String(error),
    });
    return null;
  }

  await recordCase({
    guild,
    type: `auto-${action}`,
    target: user,
    moderator: guild.client.user,
    reason,
    metadata: action === "timeout" ? { duration: `${config.timeoutMinutes}m` } : {},
    logger,
  });

  return action === "timeout"
    ? `timed out for ${config.timeoutMinutes}m`
    : action === "kick"
      ? "kicked"
      : "banned";
}
