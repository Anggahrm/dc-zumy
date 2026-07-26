import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "#db/client.js";
import { memberLevels } from "#db/schema.js";
import { loadGuildFeature } from "#services/guild-config.js";
import { getGuildLanguage, translate } from "#services/i18n.js";
import { levelFromExp } from "#utils/level.js";

export const MAX_LEVEL_REWARDS = 25;

const LEVELS_DEFAULTS = {
  enabled: false,
  xpMin: 15,
  xpMax: 25,
  cooldownSeconds: 60,
  multiplier: 1,
  announce: true,
  announceChannelId: null,
  levelUpMessage: null,
  noXpChannels: [],
  noXpRoles: [],
  rewards: [],
  stackRewards: true,
  voiceXpEnabled: false,
  voiceXpPerMinute: 2,
};

function cleanIdList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function normalizeLevels(config) {
  if (typeof config.enabled !== "boolean") config.enabled = false;
  if (!Number.isInteger(config.xpMin) || config.xpMin < 1 || config.xpMin > 100) config.xpMin = 15;
  if (!Number.isInteger(config.xpMax) || config.xpMax < config.xpMin || config.xpMax > 200) {
    config.xpMax = Math.max(25, config.xpMin);
  }
  if (!Number.isInteger(config.cooldownSeconds) || config.cooldownSeconds < 0 || config.cooldownSeconds > 600) {
    config.cooldownSeconds = 60;
  }
  if (typeof config.multiplier !== "number" || config.multiplier < 0.1 || config.multiplier > 10) {
    config.multiplier = 1;
  }
  if (typeof config.announce !== "boolean") config.announce = true;
  if (typeof config.announceChannelId !== "string") config.announceChannelId = null;
  if (typeof config.levelUpMessage !== "string" || !config.levelUpMessage.trim()) config.levelUpMessage = null;
  if (typeof config.stackRewards !== "boolean") config.stackRewards = true;
  if (typeof config.voiceXpEnabled !== "boolean") config.voiceXpEnabled = false;
  if (!Number.isInteger(config.voiceXpPerMinute) || config.voiceXpPerMinute < 1 || config.voiceXpPerMinute > 20) {
    config.voiceXpPerMinute = 2;
  }

  const noXpChannels = cleanIdList(config.noXpChannels);
  if (!Array.isArray(config.noXpChannels) || noXpChannels.length !== config.noXpChannels.length) {
    config.noXpChannels = noXpChannels;
  }
  const noXpRoles = cleanIdList(config.noXpRoles);
  if (!Array.isArray(config.noXpRoles) || noXpRoles.length !== config.noXpRoles.length) {
    config.noXpRoles = noXpRoles;
  }

  if (!Array.isArray(config.rewards)) {
    config.rewards = [];
  } else {
    const seen = new Set();
    const cleaned = config.rewards
      .filter((reward) =>
        reward
        && typeof reward === "object"
        && Number.isInteger(reward.level)
        && reward.level >= 2
        && reward.level <= 500
        && typeof reward.roleId === "string")
      .filter((reward) => {
        if (seen.has(reward.level)) return false;
        seen.add(reward.level);
        return true;
      })
      .slice(0, MAX_LEVEL_REWARDS)
      .sort((a, b) => a.level - b.level);
    if (cleaned.length !== config.rewards.length) {
      config.rewards = cleaned.map((reward) => ({ level: reward.level, roleId: reward.roleId }));
    }
  }
}

function cloneConfig(config) {
  return {
    enabled: config.enabled,
    xpMin: config.xpMin,
    xpMax: config.xpMax,
    cooldownSeconds: config.cooldownSeconds,
    multiplier: config.multiplier,
    announce: config.announce,
    announceChannelId: config.announceChannelId,
    levelUpMessage: config.levelUpMessage,
    noXpChannels: [...config.noXpChannels],
    noXpRoles: [...config.noXpRoles],
    rewards: config.rewards.map((reward) => ({ ...reward })),
    stackRewards: config.stackRewards,
    voiceXpEnabled: config.voiceXpEnabled,
    voiceXpPerMinute: config.voiceXpPerMinute,
  };
}

export async function getLevelsConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "levels", LEVELS_DEFAULTS, normalizeLevels, options);
  return cloneConfig(config);
}

export async function updateLevelsConfig(guildId, mutate) {
  const config = await loadGuildFeature(guildId, "levels", LEVELS_DEFAULTS, normalizeLevels);
  const result = mutate(config);
  normalizeLevels(config);
  return { result, config: cloneConfig(config) };
}

// --- XP awarding ---

const xpCooldowns = new Map();
const XP_COOLDOWN_MAX = 20_000;

export function isOnXpCooldown(guildId, userId, cooldownSeconds, now = Date.now()) {
  if (cooldownSeconds <= 0) return false;
  const key = `${guildId}:${userId}`;
  const readyAt = xpCooldowns.get(key) ?? 0;
  if (readyAt > now) return true;

  if (xpCooldowns.size > XP_COOLDOWN_MAX) {
    const oldest = xpCooldowns.keys().next().value;
    xpCooldowns.delete(oldest);
  }
  xpCooldowns.set(key, now + cooldownSeconds * 1000);
  return false;
}

export function randomXp(config) {
  const base = Math.floor(Math.random() * (config.xpMax - config.xpMin + 1)) + config.xpMin;
  return Math.max(1, Math.round(base * config.multiplier));
}

// Adds XP atomically and returns the new totals plus whether a level was
// gained. Level is derived from XP with the shared curve in utils/level.js.
export async function addMemberXp(guildId, userId, amount) {
  const db = getDb();
  const [row] = await db
    .insert(memberLevels)
    .values({
      guildId,
      userId,
      xp: amount,
      level: levelFromExp(amount),
      messages: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [memberLevels.guildId, memberLevels.userId],
      set: {
        xp: sql`${memberLevels.xp} + ${amount}`,
        messages: sql`${memberLevels.messages} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();

  const newLevel = levelFromExp(row.xp);
  const leveledUp = newLevel > row.level;
  if (row.level !== newLevel) {
    await db
      .update(memberLevels)
      .set({ level: newLevel })
      .where(and(eq(memberLevels.guildId, guildId), eq(memberLevels.userId, userId)));
  }

  return { xp: row.xp, level: newLevel, previousLevel: row.level, leveledUp, messages: row.messages };
}

export async function setMemberXp(guildId, userId, xp) {
  const db = getDb();
  const level = levelFromExp(xp);
  const [row] = await db
    .insert(memberLevels)
    .values({ guildId, userId, xp, level, messages: 0, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [memberLevels.guildId, memberLevels.userId],
      set: { xp, level, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function getMemberRank(guildId, userId) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(memberLevels)
    .where(and(eq(memberLevels.guildId, guildId), eq(memberLevels.userId, userId)))
    .limit(1);
  if (!row) return null;

  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(memberLevels)
    .where(and(eq(memberLevels.guildId, guildId), gt(memberLevels.xp, row.xp)));

  return { ...row, rank: count + 1 };
}

export async function getLeaderboard(guildId, { page = 1, pageSize = 10 } = {}) {
  const db = getDb();
  const offset = (page - 1) * pageSize;
  const rows = await db
    .select()
    .from(memberLevels)
    .where(eq(memberLevels.guildId, guildId))
    .orderBy(desc(memberLevels.xp))
    .limit(pageSize)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(memberLevels)
    .where(eq(memberLevels.guildId, guildId));

  return { rows, total: count, page, pageSize };
}

// --- role rewards ---

export function resolveRewardRoles(config, level) {
  const earned = config.rewards.filter((reward) => reward.level <= level);
  if (earned.length === 0) return { give: [], take: [] };

  if (config.stackRewards) {
    return { give: earned.map((reward) => reward.roleId), take: [] };
  }

  const highest = earned[earned.length - 1];
  return {
    give: [highest.roleId],
    take: earned.slice(0, -1).map((reward) => reward.roleId),
  };
}

export async function applyLevelRewards({ guild, member, config, level, logger }) {
  const { give, take } = resolveRewardRoles(config, level);
  if (give.length === 0) return;

  const me = guild.members.me;
  const assignable = (roleId) => {
    const role = guild.roles.cache.get(roleId);
    return role && !role.managed && me && role.position < me.roles.highest.position;
  };

  const toGive = give.filter((roleId) => assignable(roleId) && !member.roles.cache.has(roleId));
  const toTake = take.filter((roleId) => assignable(roleId) && member.roles.cache.has(roleId));

  try {
    if (toGive.length > 0) await member.roles.add(toGive, `Level reward (level ${level})`);
    if (toTake.length > 0) await member.roles.remove(toTake, "Level reward replaced");
  } catch (error) {
    logger?.warn("Failed to apply level rewards", {
      guildId: guild.id,
      userId: member.id,
      level,
      message: error?.message || String(error),
    });
  }
}

export function renderLevelUpMessage(template, { member, level, guild, language = "en" }) {
  const text = template || translate(language, "levels.levelup_default");
  return text
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{username}", member.user?.username ?? member.id)
    .replaceAll("{level}", String(level))
    .replaceAll("{server}", guild.name);
}

// --- voice XP ---

export const VOICE_TICK_MINUTES = 5;

// Awards voice XP to every eligible member currently in voice. Anti-farm:
// a channel needs at least 2 non-bot members, and self-deafened members
// (present but not listening) earn nothing.
export async function runVoiceXpTick(client, logger) {
  for (const guild of client.guilds.cache.values()) {
    let config;
    try {
      config = await getLevelsConfig(guild.id, { preferCache: true });
    } catch {
      continue;
    }
    if (!config.enabled || !config.voiceXpEnabled) continue;

    const byChannel = new Map();
    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || !state.member || state.member.user.bot) continue;
      if (state.selfDeaf || state.deaf) continue;
      if (config.noXpChannels.includes(state.channelId)) continue;
      if (config.noXpRoles.some((roleId) => state.member.roles.cache.has(roleId))) continue;

      let members = byChannel.get(state.channelId);
      if (!members) {
        members = [];
        byChannel.set(state.channelId, members);
      }
      members.push(state.member);
    }

    const amount = config.voiceXpPerMinute * VOICE_TICK_MINUTES;
    for (const members of byChannel.values()) {
      if (members.length < 2) continue;

      for (const member of members) {
        try {
          const result = await addMemberXp(guild.id, member.id, amount);
          if (result.leveledUp) {
            await applyLevelRewards({ guild, member, config, level: result.level, logger });
            if (config.announce && config.announceChannelId) {
              const channel = guild.channels.cache.get(config.announceChannelId);
              if (channel?.isTextBased() && typeof channel.send === "function") {
                await channel
                  .send({
                    content: renderLevelUpMessage(config.levelUpMessage, {
                      member,
                      level: result.level,
                      guild,
                      language: await getGuildLanguage(guild.id),
                    }),
                    allowedMentions: { users: [member.id] },
                  })
                  .catch(() => {});
              }
            }
          }
        } catch (error) {
          logger?.warn("Voice XP award failed", {
            guildId: guild.id,
            userId: member.id,
            message: error?.message || String(error),
          });
        }
      }
    }
  }
}
