import { PermissionFlagsBits } from "discord.js";
import { loadGuildFeature } from "#services/guild-config.js";

const INVITES_DEFAULTS = {
  counts: {},
  joinedBy: {},
};

function normalizeInvites(config) {
  if (!config.counts || typeof config.counts !== "object" || Array.isArray(config.counts)) {
    config.counts = {};
  }
  if (!config.joinedBy || typeof config.joinedBy !== "object" || Array.isArray(config.joinedBy)) {
    config.joinedBy = {};
  }
}

// --- live invite-use cache (code -> {uses, inviterId}) ---

const inviteCache = new Map();

function cacheKey(guildId) {
  return guildId;
}

export function primeInviteCacheEntry(invite) {
  const guildId = invite.guild?.id ?? invite.guildId;
  if (!guildId) return;
  let codes = inviteCache.get(cacheKey(guildId));
  if (!codes) {
    codes = new Map();
    inviteCache.set(cacheKey(guildId), codes);
  }
  codes.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter?.id ?? null });
}

export function dropInviteCacheEntry(guildId, code) {
  inviteCache.get(cacheKey(guildId))?.delete(code);
}

export async function primeGuildInvites(guild) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) return false;

  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return false;

  const codes = new Map();
  for (const invite of invites.values()) {
    codes.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter?.id ?? null });
  }
  inviteCache.set(cacheKey(guild.id), codes);
  return true;
}

// Compares fresh invite uses against the cache to find which invite was
// consumed by a join. Best-effort: vanity URLs and uncached invites return
// null.
export async function resolveInviter(guild) {
  const cached = inviteCache.get(cacheKey(guild.id));
  const primed = await primeGuildInvitesFresh(guild);
  if (!primed || !cached) return null;

  for (const [code, entry] of primed) {
    const before = cached.get(code);
    if (before ? entry.uses > before.uses : entry.uses > 0) {
      return { code, inviterId: entry.inviterId };
    }
  }
  return null;
}

async function primeGuildInvitesFresh(guild) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) return null;

  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null;

  const codes = new Map();
  for (const invite of invites.values()) {
    codes.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter?.id ?? null });
  }
  inviteCache.set(cacheKey(guild.id), codes);
  return codes;
}

// --- persistent per-inviter stats ---

export async function recordInviteJoin(guildId, userId, inviterId) {
  const config = await loadGuildFeature(guildId, "invites", INVITES_DEFAULTS, normalizeInvites);

  if (inviterId) {
    const current = config.counts[inviterId] ?? { joins: 0, leaves: 0 };
    config.counts = {
      ...config.counts,
      [inviterId]: { joins: current.joins + 1, leaves: current.leaves },
    };
    config.joinedBy = { ...config.joinedBy, [userId]: inviterId };
  }
}

export async function recordInviteLeave(guildId, userId) {
  const config = await loadGuildFeature(guildId, "invites", INVITES_DEFAULTS, normalizeInvites);
  const inviterId = config.joinedBy[userId];
  if (!inviterId) return;

  const current = config.counts[inviterId] ?? { joins: 0, leaves: 0 };
  config.counts = {
    ...config.counts,
    [inviterId]: { joins: current.joins, leaves: current.leaves + 1 },
  };

  const nextJoinedBy = { ...config.joinedBy };
  delete nextJoinedBy[userId];
  config.joinedBy = nextJoinedBy;
}

export async function getInviteStats(guildId, userId) {
  const config = await loadGuildFeature(guildId, "invites", INVITES_DEFAULTS, normalizeInvites);
  const entry = config.counts[userId] ?? { joins: 0, leaves: 0 };
  return { joins: entry.joins, leaves: entry.leaves, net: entry.joins - entry.leaves };
}

export async function getInviteLeaderboard(guildId, limit = 10) {
  const config = await loadGuildFeature(guildId, "invites", INVITES_DEFAULTS, normalizeInvites);
  return Object.entries(config.counts)
    .map(([userId, entry]) => ({ userId, joins: entry.joins, leaves: entry.leaves, net: entry.joins - entry.leaves }))
    .sort((a, b) => b.net - a.net)
    .slice(0, limit);
}
