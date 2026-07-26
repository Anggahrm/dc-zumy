import { loadGuildFeature } from "#services/guild-config.js";

export const MAX_TRIGGERS = 25;
export const MAX_MATCH_LENGTH = 100;
export const MAX_RESPONSE_LENGTH = 1000;
export const TRIGGER_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]{0,31}$/;
export const TRIGGER_TYPES = ["contains", "exact", "wildcard"];

const TRIGGERS_DEFAULTS = {};

function normalizeTriggers(config) {
  for (const [name, trigger] of Object.entries(config)) {
    if (
      !TRIGGER_NAME_PATTERN.test(name)
      || !trigger
      || typeof trigger !== "object"
      || typeof trigger.match !== "string"
      || !trigger.match.trim()
      || typeof trigger.response !== "string"
      || !trigger.response.trim()
    ) {
      delete config[name];
      continue;
    }

    if (!TRIGGER_TYPES.includes(trigger.type)) trigger.type = "contains";
    if (!Number.isInteger(trigger.chance) || trigger.chance < 1 || trigger.chance > 100) trigger.chance = 100;
    if (!Number.isInteger(trigger.cooldownSeconds) || trigger.cooldownSeconds < 0 || trigger.cooldownSeconds > 3600) {
      trigger.cooldownSeconds = 30;
    }
    if (!Array.isArray(trigger.channels)) trigger.channels = [];
  }
}

export function sanitizeTriggerName(name) {
  const value = String(name ?? "").trim().toLowerCase();
  return TRIGGER_NAME_PATTERN.test(value) ? value : null;
}

export async function getTriggers(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "triggers", TRIGGERS_DEFAULTS, normalizeTriggers, options);
  return Object.fromEntries(
    Object.entries(config).map(([name, trigger]) => [name, { ...trigger, channels: [...trigger.channels] }]),
  );
}

export async function createTrigger(guildId, name, { match, response, type, chance, cooldownSeconds, channelId }) {
  const safeName = sanitizeTriggerName(name);
  if (!safeName) return { ok: false, reason: "invalid_name" };

  const config = await loadGuildFeature(guildId, "triggers", TRIGGERS_DEFAULTS, normalizeTriggers);
  if (config[safeName]) return { ok: false, reason: "exists" };
  if (Object.keys(config).length >= MAX_TRIGGERS) return { ok: false, reason: "full" };

  const cleanMatch = String(match ?? "").trim().slice(0, MAX_MATCH_LENGTH);
  const cleanResponse = String(response ?? "").trim().slice(0, MAX_RESPONSE_LENGTH);
  if (!cleanMatch || !cleanResponse) return { ok: false, reason: "empty" };

  config[safeName] = {
    match: cleanMatch,
    response: cleanResponse,
    type: TRIGGER_TYPES.includes(type) ? type : "contains",
    chance: Number.isInteger(chance) ? Math.min(Math.max(chance, 1), 100) : 100,
    cooldownSeconds: Number.isInteger(cooldownSeconds) ? Math.min(Math.max(cooldownSeconds, 0), 3600) : 30,
    channels: channelId ? [channelId] : [],
  };

  return { ok: true, name: safeName };
}

export async function deleteTrigger(guildId, name) {
  const safeName = sanitizeTriggerName(name);
  if (!safeName) return false;

  const config = await loadGuildFeature(guildId, "triggers", TRIGGERS_DEFAULTS, normalizeTriggers);
  if (!config[safeName]) return false;
  delete config[safeName];
  return true;
}

export async function toggleTriggerChannel(guildId, name, channelId) {
  const safeName = sanitizeTriggerName(name);
  if (!safeName) return null;

  const config = await loadGuildFeature(guildId, "triggers", TRIGGERS_DEFAULTS, normalizeTriggers);
  const trigger = config[safeName];
  if (!trigger) return null;

  const has = trigger.channels.includes(channelId);
  trigger.channels = has
    ? trigger.channels.filter((id) => id !== channelId)
    : [...trigger.channels, channelId];
  return { restricted: !has, channels: [...trigger.channels] };
}

// --- matching ---

const wildcardCache = new Map();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardRegex(pattern) {
  const cached = wildcardCache.get(pattern);
  if (cached) return cached;

  const regex = new RegExp(`^${escapeRegex(pattern).replaceAll("\\*", ".*")}$`, "is");
  if (wildcardCache.size > 500) wildcardCache.clear();
  wildcardCache.set(pattern, regex);
  return regex;
}

export function triggerMatches(trigger, content) {
  const text = content.trim();
  if (!text) return false;

  if (trigger.type === "exact") {
    return text.toLowerCase() === trigger.match.toLowerCase();
  }
  if (trigger.type === "wildcard") {
    return wildcardRegex(trigger.match).test(text);
  }
  return text.toLowerCase().includes(trigger.match.toLowerCase());
}

const triggerCooldowns = new Map();
const TRIGGER_COOLDOWN_MAX = 5000;

export function isTriggerOnCooldown(guildId, name, cooldownSeconds, now = Date.now()) {
  if (cooldownSeconds <= 0) return false;
  const key = `${guildId}:${name}`;
  const readyAt = triggerCooldowns.get(key) ?? 0;
  if (readyAt > now) return true;

  if (triggerCooldowns.size > TRIGGER_COOLDOWN_MAX) {
    const oldest = triggerCooldowns.keys().next().value;
    triggerCooldowns.delete(oldest);
  }
  triggerCooldowns.set(key, now + cooldownSeconds * 1000);
  return false;
}

export function renderTriggerResponse(template, { message, guild }) {
  return template
    .replaceAll("{user}", `<@${message.author.id}>`)
    .replaceAll("{username}", message.author.username ?? message.author.id)
    .replaceAll("{server}", guild.name);
}

// Finds the first matching, off-cooldown trigger that wins its chance roll.
export function resolveTrigger(triggers, { guildId, channelId, parentChannelId, content }) {
  for (const [name, trigger] of Object.entries(triggers)) {
    if (trigger.channels.length > 0
      && !trigger.channels.includes(channelId)
      && !(parentChannelId && trigger.channels.includes(parentChannelId))) {
      continue;
    }
    if (!triggerMatches(trigger, content)) continue;
    if (trigger.chance < 100 && Math.random() * 100 >= trigger.chance) continue;
    if (isTriggerOnCooldown(guildId, name, trigger.cooldownSeconds)) continue;
    return { name, trigger };
  }
  return null;
}
