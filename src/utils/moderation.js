import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { createCard } from "#utils/respond.js";

export function normalizeReason(reason) {
  return reason?.trim() || "No reason provided.";
}

// Best-effort DM to a user about a moderation action. Returns true when the
// DM was delivered.
export async function dmModerationNotice(user, { guildName, actionLabel, color = 0xf1c40f, reason, lines = [] }) {
  try {
    await user.send({
      components: [
        createCard({
          color,
          title: actionLabel,
          body: [
            `You received a moderation action in **${guildName}**.`,
            `- Action: **${actionLabel}**`,
            `- Reason: ${reason || "No reason provided."}`,
            ...lines,
          ].join("\n"),
        }),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
    return true;
  } catch {
    return false;
  }
}

// Locks or unlocks a channel by toggling the @everyone SendMessages overwrite.
// Unlock resets the overwrite to neutral (null) rather than forcing allow.
export async function setChannelLock(channel, locked, reason) {
  await channel.permissionOverwrites.edit(
    channel.guild.roles.everyone,
    { SendMessages: locked ? false : null },
    { reason },
  );
}

export function canManageChannel(channel) {
  const me = channel.guild.members.me;
  if (!me) return false;
  return channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageRoles) ?? false;
}

// Returns a user-facing rejection reason, or null when the actor outranks the
// target (or is the guild owner).
export function checkActorHierarchy({ guild, actorUserId, actorMember, targetUserId, targetMember }) {
  if (targetUserId === actorUserId) {
    return "You cannot moderate yourself.";
  }

  if (targetUserId === guild.ownerId) {
    return "You cannot moderate the server owner.";
  }

  if (
    targetMember
    && actorUserId !== guild.ownerId
    && targetMember.roles.highest.position >= actorMember.roles.highest.position
  ) {
    return "You cannot moderate a member with an equal or higher role than yours.";
  }

  return null;
}
