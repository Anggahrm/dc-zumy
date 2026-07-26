import { loadGuildFeature } from "#services/guild-config.js";

export const JOINGUARD_ACTIONS = ["alert", "kick", "quarantine", "ban"];

const JOINGUARD_DEFAULTS = {
  minAccountAgeHours: 0,
  surgeCount: 0,
  surgeWindowSeconds: 30,
  action: "alert",
};

function normalizeJoinguard(config) {
  if (!Number.isInteger(config.minAccountAgeHours) || config.minAccountAgeHours < 0 || config.minAccountAgeHours > 24 * 90) {
    config.minAccountAgeHours = 0;
  }
  if (!Number.isInteger(config.surgeCount) || config.surgeCount < 0 || config.surgeCount > 100) {
    config.surgeCount = 0;
  }
  if (!Number.isInteger(config.surgeWindowSeconds) || config.surgeWindowSeconds < 5 || config.surgeWindowSeconds > 300) {
    config.surgeWindowSeconds = 30;
  }
  if (!JOINGUARD_ACTIONS.includes(config.action)) {
    config.action = "alert";
  }
}

function cloneConfig(config) {
  return {
    minAccountAgeHours: config.minAccountAgeHours,
    surgeCount: config.surgeCount,
    surgeWindowSeconds: config.surgeWindowSeconds,
    action: config.action,
  };
}

export async function getJoinguardConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "joinguard", JOINGUARD_DEFAULTS, normalizeJoinguard, options);
  return cloneConfig(config);
}

export async function updateJoinguardConfig(guildId, mutate) {
  const config = await loadGuildFeature(guildId, "joinguard", JOINGUARD_DEFAULTS, normalizeJoinguard);
  mutate(config);
  normalizeJoinguard(config);
  return cloneConfig(config);
}

export function isJoinguardActive(config) {
  return config.minAccountAgeHours > 0 || config.surgeCount > 0;
}

// --- surge tracking (in-memory ring of recent join timestamps per guild) ---

const joinWindows = new Map();

export function trackJoin(guildId, { surgeCount, surgeWindowSeconds }, now = Date.now()) {
  if (surgeCount <= 0) return false;

  let window = joinWindows.get(guildId);
  if (!window) {
    window = [];
    joinWindows.set(guildId, window);
  }

  const cutoff = now - surgeWindowSeconds * 1000;
  while (window.length > 0 && window[0] <= cutoff) {
    window.shift();
  }
  window.push(now);

  return window.length >= surgeCount;
}

// Returns a violation descriptor for a joining member, or null.
export function checkJoin(config, member, now = Date.now()) {
  if (config.minAccountAgeHours > 0) {
    const ageMs = now - member.user.createdTimestamp;
    if (ageMs < config.minAccountAgeHours * 60 * 60 * 1000) {
      const ageHours = Math.max(1, Math.floor(ageMs / (60 * 60 * 1000)));
      return {
        rule: "account_age",
        label: `Account too new (${ageHours}h old, minimum ${config.minAccountAgeHours}h)`,
      };
    }
  }

  if (trackJoin(member.guild.id, config, now)) {
    return {
      rule: "join_surge",
      label: `Join surge (${config.surgeCount}+ joins in ${config.surgeWindowSeconds}s)`,
    };
  }

  return null;
}
