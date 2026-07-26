import { loadGuildFeature } from "#services/guild-config.js";

export const MAX_MENUS = 25;
export const MAX_MENU_ROLES = 25;
export const MENU_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]{0,31}$/;

const ROLEMENUS_DEFAULTS = {};

function normalizeRolemenus(config) {
  for (const [name, menu] of Object.entries(config)) {
    if (
      !MENU_NAME_PATTERN.test(name)
      || !menu
      || typeof menu !== "object"
      || typeof menu.title !== "string"
      || !Array.isArray(menu.roles)
    ) {
      delete config[name];
      continue;
    }

    if (menu.mode !== "select") menu.mode = "buttons";
    if (typeof menu.unique !== "boolean") menu.unique = false;
    const roles = menu.roles.filter((id) => typeof id === "string");
    if (roles.length !== menu.roles.length) menu.roles = roles;
    if (typeof menu.channelId !== "string") menu.channelId = null;
    if (typeof menu.messageId !== "string") menu.messageId = null;
  }
}

export function sanitizeMenuName(name) {
  const value = String(name ?? "").trim().toLowerCase();
  return MENU_NAME_PATTERN.test(value) ? value : null;
}

export async function getMenus(guildId) {
  const config = await loadGuildFeature(guildId, "rolemenus", ROLEMENUS_DEFAULTS, normalizeRolemenus);
  return Object.fromEntries(
    Object.entries(config).map(([name, menu]) => [name, { ...menu, roles: [...menu.roles] }]),
  );
}

export async function getMenu(guildId, name, options = {}) {
  const safeName = sanitizeMenuName(name);
  if (!safeName) return null;
  const config = await loadGuildFeature(guildId, "rolemenus", ROLEMENUS_DEFAULTS, normalizeRolemenus, options);
  const menu = config[safeName];
  return menu ? { name: safeName, ...menu, roles: [...menu.roles] } : null;
}

export async function createMenu(guildId, name, { title, description = null, mode = "buttons", unique = false }) {
  const safeName = sanitizeMenuName(name);
  if (!safeName) {
    return { ok: false, reason: "invalid_name" };
  }

  const config = await loadGuildFeature(guildId, "rolemenus", ROLEMENUS_DEFAULTS, normalizeRolemenus);
  if (config[safeName]) {
    return { ok: false, reason: "exists" };
  }
  if (Object.keys(config).length >= MAX_MENUS) {
    return { ok: false, reason: "full" };
  }

  config[safeName] = {
    title: String(title).slice(0, 100),
    description: description ? String(description).slice(0, 300) : null,
    mode: mode === "select" ? "select" : "buttons",
    unique: Boolean(unique),
    roles: [],
    channelId: null,
    messageId: null,
  };

  return { ok: true, name: safeName };
}

export async function deleteMenu(guildId, name) {
  const safeName = sanitizeMenuName(name);
  if (!safeName) return null;

  const config = await loadGuildFeature(guildId, "rolemenus", ROLEMENUS_DEFAULTS, normalizeRolemenus);
  const menu = config[safeName];
  if (!menu) return null;

  const removed = { name: safeName, ...menu, roles: [...menu.roles] };
  delete config[safeName];
  return removed;
}

export async function addMenuRole(guildId, name, roleId) {
  const safeName = sanitizeMenuName(name);
  if (!safeName) return { ok: false, reason: "not_found" };

  const config = await loadGuildFeature(guildId, "rolemenus", ROLEMENUS_DEFAULTS, normalizeRolemenus);
  const menu = config[safeName];
  if (!menu) return { ok: false, reason: "not_found" };
  if (menu.roles.includes(roleId)) return { ok: false, reason: "exists" };
  if (menu.roles.length >= MAX_MENU_ROLES) return { ok: false, reason: "full" };

  menu.roles = [...menu.roles, roleId];
  return { ok: true, count: menu.roles.length };
}

export async function removeMenuRole(guildId, name, roleId) {
  const safeName = sanitizeMenuName(name);
  if (!safeName) return { ok: false, reason: "not_found" };

  const config = await loadGuildFeature(guildId, "rolemenus", ROLEMENUS_DEFAULTS, normalizeRolemenus);
  const menu = config[safeName];
  if (!menu) return { ok: false, reason: "not_found" };

  const next = menu.roles.filter((id) => id !== roleId);
  if (next.length === menu.roles.length) return { ok: false, reason: "missing" };

  menu.roles = next;
  return { ok: true, count: menu.roles.length };
}

export async function setMenuMessage(guildId, name, channelId, messageId) {
  const safeName = sanitizeMenuName(name);
  if (!safeName) return;

  const config = await loadGuildFeature(guildId, "rolemenus", ROLEMENUS_DEFAULTS, normalizeRolemenus);
  const menu = config[safeName];
  if (!menu) return;

  menu.channelId = channelId;
  menu.messageId = messageId;
}
