import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "#utils/paths.js";

const STORE_PATH = path.join(PROJECT_ROOT, "data", "autorole.json");
let mutationQueue = Promise.resolve();

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== "string" || !value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeGuildConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { roles: [], blacklist: [] };
  }

  return {
    roles: uniqueStrings(config.roles),
    blacklist: uniqueStrings(config.blacklist),
  };
}

function normalizeDb(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { guilds: {} };
  }

  const guilds = {};
  const sourceGuilds = raw.guilds;
  if (sourceGuilds && typeof sourceGuilds === "object" && !Array.isArray(sourceGuilds)) {
    for (const [guildId, config] of Object.entries(sourceGuilds)) {
      if (!guildId) continue;
      guilds[guildId] = normalizeGuildConfig(config);
    }
  }

  return { guilds };
}

function cloneConfig(config) {
  return {
    roles: [...config.roles],
    blacklist: [...config.blacklist],
  };
}

async function readDb() {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return normalizeDb(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { guilds: {} };
    }
    throw error;
  }
}

async function writeDb(db) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function ensureGuildConfig(db, guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = { roles: [], blacklist: [] };
  } else {
    db.guilds[guildId] = normalizeGuildConfig(db.guilds[guildId]);
  }

  return db.guilds[guildId];
}

function runMutation(task) {
  const pending = mutationQueue.then(task, task);
  mutationQueue = pending.catch(() => {});
  return pending;
}

export async function getAutoroleConfig(guildId) {
  const db = await readDb();
  return normalizeGuildConfig(db.guilds[guildId]);
}

export async function addAutoroleRole(guildId, roleId) {
  return runMutation(async () => {
    const db = await readDb();
    const config = ensureGuildConfig(db, guildId);

    if (config.roles.includes(roleId)) {
      return { added: false, config: cloneConfig(config) };
    }

    config.roles.push(roleId);
    await writeDb(db);
    return { added: true, config: cloneConfig(config) };
  });
}

export async function removeAutoroleRole(guildId, roleId) {
  return runMutation(async () => {
    const db = await readDb();
    const config = ensureGuildConfig(db, guildId);
    const nextRoles = config.roles.filter((id) => id !== roleId);
    const removed = nextRoles.length !== config.roles.length;

    if (removed) {
      config.roles = nextRoles;
      await writeDb(db);
    }

    return { removed, config: cloneConfig(config) };
  });
}

export async function addAutoroleBlacklist(guildId, roleId) {
  return runMutation(async () => {
    const db = await readDb();
    const config = ensureGuildConfig(db, guildId);
    const added = !config.blacklist.includes(roleId);

    if (added) {
      config.blacklist.push(roleId);
    }

    const nextRoles = config.roles.filter((id) => id !== roleId);
    const removedFromRoles = nextRoles.length !== config.roles.length;
    config.roles = nextRoles;

    if (added || removedFromRoles) {
      await writeDb(db);
    }

    return {
      added,
      removedFromRoles,
      config: cloneConfig(config),
    };
  });
}

export async function removeAutoroleBlacklist(guildId, roleId) {
  return runMutation(async () => {
    const db = await readDb();
    const config = ensureGuildConfig(db, guildId);
    const nextBlacklist = config.blacklist.filter((id) => id !== roleId);
    const removed = nextBlacklist.length !== config.blacklist.length;

    if (removed) {
      config.blacklist = nextBlacklist;
      await writeDb(db);
    }

    return { removed, config: cloneConfig(config) };
  });
}
