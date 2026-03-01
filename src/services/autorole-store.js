function normalizeRoleIds(values) {
  if (!Array.isArray(values)) return [];

  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

function ensureGuildEntry(guildId) {
  const guild = global.db.data.guilds[guildId];
  if (!guild.autorole || typeof guild.autorole !== "object" || Array.isArray(guild.autorole)) {
    guild.autorole = { roles: [], blacklist: [] };
  }

  guild.autorole.roles = normalizeRoleIds(guild.autorole.roles);
  guild.autorole.blacklist = normalizeRoleIds(guild.autorole.blacklist);
  return guild.autorole;
}

function cloneConfig(config) {
  return {
    roles: [...config.roles],
    blacklist: [...config.blacklist],
  };
}

export async function getAutoroleConfig(guildId) {
  await global.db.loadGuild(guildId);
  return cloneConfig(ensureGuildEntry(guildId));
}

export async function addAutoroleRole(guildId, roleId) {
  await global.db.loadGuild(guildId);
  const config = ensureGuildEntry(guildId);

  if (config.roles.includes(roleId)) {
    return { added: false, config: cloneConfig(config) };
  }

  config.roles.push(roleId);
  return { added: true, config: cloneConfig(config) };
}

export async function removeAutoroleRole(guildId, roleId) {
  await global.db.loadGuild(guildId);
  const config = ensureGuildEntry(guildId);
  const nextRoles = config.roles.filter((id) => id !== roleId);
  const removed = nextRoles.length !== config.roles.length;

  if (removed) {
    config.roles = nextRoles;
  }

  return { removed, config: cloneConfig(config) };
}

export async function addAutoroleBlacklist(guildId, roleId) {
  await global.db.loadGuild(guildId);
  const config = ensureGuildEntry(guildId);
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
  await global.db.loadGuild(guildId);
  const config = ensureGuildEntry(guildId);
  const nextBlacklist = config.blacklist.filter((id) => id !== roleId);
  const removed = nextBlacklist.length !== config.blacklist.length;

  if (removed) {
    config.blacklist = nextBlacklist;
  }

  return { removed, config: cloneConfig(config) };
}
