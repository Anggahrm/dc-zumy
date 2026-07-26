import { loadGuildFeature } from "#services/guild-config.js";

const MOD_CONFIG_DEFAULTS = {
  muteRoleId: null,
  quarantineRoleId: null,
  quarantineSnapshots: {},
};

function normalizeModConfig(config) {
  if (typeof config.muteRoleId !== "string") config.muteRoleId = null;
  if (typeof config.quarantineRoleId !== "string") config.quarantineRoleId = null;
  if (!config.quarantineSnapshots || typeof config.quarantineSnapshots !== "object" || Array.isArray(config.quarantineSnapshots)) {
    config.quarantineSnapshots = {};
  }
}

export async function getModConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "moderation", MOD_CONFIG_DEFAULTS, normalizeModConfig, options);
  return {
    muteRoleId: config.muteRoleId,
    quarantineRoleId: config.quarantineRoleId,
  };
}

export async function setMuteRole(guildId, roleId) {
  const config = await loadGuildFeature(guildId, "moderation", MOD_CONFIG_DEFAULTS, normalizeModConfig);
  config.muteRoleId = roleId ?? null;
}

export async function setQuarantineRole(guildId, roleId) {
  const config = await loadGuildFeature(guildId, "moderation", MOD_CONFIG_DEFAULTS, normalizeModConfig);
  config.quarantineRoleId = roleId ?? null;
}

export async function saveQuarantineSnapshot(guildId, userId, roleIds) {
  const config = await loadGuildFeature(guildId, "moderation", MOD_CONFIG_DEFAULTS, normalizeModConfig);
  config.quarantineSnapshots = {
    ...config.quarantineSnapshots,
    [userId]: [...roleIds],
  };
}

export async function takeQuarantineSnapshot(guildId, userId) {
  const config = await loadGuildFeature(guildId, "moderation", MOD_CONFIG_DEFAULTS, normalizeModConfig);
  const snapshot = config.quarantineSnapshots[userId];
  if (!Array.isArray(snapshot)) return null;

  const next = { ...config.quarantineSnapshots };
  delete next[userId];
  config.quarantineSnapshots = next;
  return [...snapshot];
}
