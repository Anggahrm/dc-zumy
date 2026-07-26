import { loadGuildFeature } from "#services/guild-config.js";

const MAX_SNAPSHOTS = 1000;

const ROLEPERSIST_DEFAULTS = {
  enabled: false,
  snapshots: {},
};

function normalizeRolepersist(config) {
  if (typeof config.enabled !== "boolean") config.enabled = false;
  if (!config.snapshots || typeof config.snapshots !== "object" || Array.isArray(config.snapshots)) {
    config.snapshots = {};
  }
}

export async function getRolepersistConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "rolepersist", ROLEPERSIST_DEFAULTS, normalizeRolepersist, options);
  return { enabled: config.enabled, snapshotCount: Object.keys(config.snapshots).length };
}

export async function setRolepersistEnabled(guildId, enabled) {
  const config = await loadGuildFeature(guildId, "rolepersist", ROLEPERSIST_DEFAULTS, normalizeRolepersist);
  config.enabled = enabled;
  if (!enabled) {
    config.snapshots = {};
  }
}

export async function saveRoleSnapshot(guildId, userId, roleIds) {
  const config = await loadGuildFeature(guildId, "rolepersist", ROLEPERSIST_DEFAULTS, normalizeRolepersist);
  if (!config.enabled) return;

  const ids = Object.keys(config.snapshots);
  if (ids.length >= MAX_SNAPSHOTS && !config.snapshots[userId]) {
    const oldest = ids.sort((a, b) => (config.snapshots[a].at ?? 0) - (config.snapshots[b].at ?? 0))[0];
    const next = { ...config.snapshots };
    delete next[oldest];
    config.snapshots = next;
  }

  config.snapshots = {
    ...config.snapshots,
    [userId]: { roles: [...roleIds], at: Date.now() },
  };
}

export async function takeRoleSnapshot(guildId, userId) {
  const config = await loadGuildFeature(guildId, "rolepersist", ROLEPERSIST_DEFAULTS, normalizeRolepersist);
  if (!config.enabled) return null;

  const snapshot = config.snapshots[userId];
  if (!snapshot) return null;

  const next = { ...config.snapshots };
  delete next[userId];
  config.snapshots = next;
  return [...(snapshot.roles ?? [])];
}
