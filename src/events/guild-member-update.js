import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

function sortIds(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function diffRoleIds(previousRoles, nextRoles) {
  const previous = new Set(previousRoles.map((role) => role.id));
  const next = new Set(nextRoles.map((role) => role.id));

  return {
    added: sortIds([...next].filter((id) => !previous.has(id))),
    removed: sortIds([...previous].filter((id) => !next.has(id))),
  };
}

function formatRoleList(roleIds) {
  if (roleIds.length === 0) return "- (none)";
  return roleIds.map((roleId) => `<@&${roleId}>`).join(", ");
}

function memberTag(member) {
  return member.user?.tag ?? member.id;
}

function memberActor(member) {
  return {
    actorId: member.id,
    actorName: member.user?.tag ?? member.id,
    actorAvatarUrl: member.user?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
    actorAvatarDescription: `${member.user?.tag ?? member.id} avatar`,
  };
}

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    const logger = newMember.client.zumy?.logger;
    const actor = memberActor(newMember);
    const oldName = oldMember.displayName;
    const newName = newMember.displayName;
    if (oldName !== newName) {
      await sendGuildLog({
        guild: newMember.guild,
        eventKey: "name_updates",
        title: "Member Name Updated",
        color: 0x3498db,
        lines: [
          `- Member: **${memberTag(newMember)}**`,
          `- User ID: \`${newMember.id}\``,
          `- Before: ${oldName || "(none)"}`,
          `- After: ${newName || "(none)"}`,
        ],
        ...actor,
        logger,
      });
    }

    const roleChanges = diffRoleIds(
      Array.from(oldMember.roles.cache.values()),
      Array.from(newMember.roles.cache.values()),
    );
    if (roleChanges.added.length > 0 || roleChanges.removed.length > 0) {
      await sendGuildLog({
        guild: newMember.guild,
        eventKey: "member_roles",
        title: "Member Roles Updated",
        color: 0x3498db,
        lines: [
          `- Member: **${memberTag(newMember)}**`,
          `- User ID: \`${newMember.id}\``,
          `- Added: ${formatRoleList(roleChanges.added)}`,
          `- Removed: ${formatRoleList(roleChanges.removed)}`,
        ],
        ...actor,
        logger,
      });
    }

    const oldTimedOutUntil = oldMember.communicationDisabledUntilTimestamp ?? null;
    const newTimedOutUntil = newMember.communicationDisabledUntilTimestamp ?? null;
    if (oldTimedOutUntil !== newTimedOutUntil) {
      const isApplied = Boolean(newTimedOutUntil);
      await sendGuildLog({
        guild: newMember.guild,
        eventKey: isApplied ? "timeouts" : "remove_timeouts",
        title: isApplied ? "Member Timed Out" : "Member Timeout Removed",
        color: isApplied ? 0xf1c40f : 0x57f287,
        lines: [
          `- Member: **${memberTag(newMember)}**`,
          `- User ID: \`${newMember.id}\``,
          `- Until: ${newTimedOutUntil ? `<t:${Math.floor(newTimedOutUntil / 1000)}:F>` : "Removed"}`,
        ],
        ...actor,
        logger,
      });
    }
  },
};
