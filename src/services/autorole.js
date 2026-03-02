import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";

const AUTOROLE_DEFAULTS = {
  roles: [],
  blacklist: [],
};

function normalizeAutorole(config) {
  config.roles = guildFeatureUtils.normalizeRoleIds(config.roles);
  config.blacklist = guildFeatureUtils.normalizeRoleIds(config.blacklist);
}

function cloneConfig(config) {
  return {
    roles: [...config.roles],
    blacklist: [...config.blacklist],
  };
}

export async function getAutoroleConfig(guildId) {
  const config = await loadGuildFeature(guildId, "autorole", AUTOROLE_DEFAULTS, normalizeAutorole);
  return cloneConfig(config);
}

export async function addAutoroleRole(guildId, roleId) {
  const config = await loadGuildFeature(guildId, "autorole", AUTOROLE_DEFAULTS, normalizeAutorole);

  if (config.roles.includes(roleId)) {
    return { added: false, config: cloneConfig(config) };
  }

  config.roles.push(roleId);
  return { added: true, config: cloneConfig(config) };
}

export async function removeAutoroleRole(guildId, roleId) {
  const config = await loadGuildFeature(guildId, "autorole", AUTOROLE_DEFAULTS, normalizeAutorole);
  const nextRoles = config.roles.filter((id) => id !== roleId);
  const removed = nextRoles.length !== config.roles.length;

  if (removed) {
    config.roles = nextRoles;
  }

  return { removed, config: cloneConfig(config) };
}

export async function addAutoroleBlacklist(guildId, roleId) {
  const config = await loadGuildFeature(guildId, "autorole", AUTOROLE_DEFAULTS, normalizeAutorole);
  const added = !config.blacklist.includes(roleId);

  if (added) {
    config.blacklist.push(roleId);
  }

  const nextRoles = config.roles.filter((id) => id !== roleId);
  const removedFromRoles = nextRoles.length !== config.roles.length;
  config.roles = nextRoles;

  return {
    added,
    removedFromRoles,
    config: cloneConfig(config),
  };
}

export async function removeAutoroleBlacklist(guildId, roleId) {
  const config = await loadGuildFeature(guildId, "autorole", AUTOROLE_DEFAULTS, normalizeAutorole);
  const nextBlacklist = config.blacklist.filter((id) => id !== roleId);
  const removed = nextBlacklist.length !== config.blacklist.length;

  if (removed) {
    config.blacklist = nextBlacklist;
  }

  return { removed, config: cloneConfig(config) };
}
