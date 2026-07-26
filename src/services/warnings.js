import { loadGuildFeature } from "#services/guild-config.js";

const WARNINGS_DEFAULTS = {};
const MAX_WARNINGS_PER_USER = 50;
const MAX_REASON_LENGTH = 400;

let warnCounter = 0;

function normalizeWarnings(config) {
  for (const [userId, entries] of Object.entries(config)) {
    if (!Array.isArray(entries)) {
      delete config[userId];
    }
  }
}

function sanitizeReason(reason) {
  const text = typeof reason === "string" ? reason.trim() : "";
  return (text || "No reason provided.").slice(0, MAX_REASON_LENGTH);
}

function makeWarnId() {
  warnCounter = (warnCounter + 1) % 1296;
  return `${Date.now().toString(36)}${warnCounter.toString(36).padStart(2, "0")}`;
}

export async function addWarning(guildId, userId, { moderatorId, reason }) {
  const config = await loadGuildFeature(guildId, "warnings", WARNINGS_DEFAULTS, normalizeWarnings);
  if (!Array.isArray(config[userId])) {
    config[userId] = [];
  }

  if (config[userId].length >= MAX_WARNINGS_PER_USER) {
    config[userId] = config[userId].slice(-(MAX_WARNINGS_PER_USER - 1));
  }

  const entry = {
    id: makeWarnId(),
    moderatorId,
    reason: sanitizeReason(reason),
    at: Date.now(),
  };
  config[userId] = [...config[userId], entry];

  return { entry, count: config[userId].length };
}

export async function getWarnings(guildId, userId) {
  const config = await loadGuildFeature(guildId, "warnings", WARNINGS_DEFAULTS, normalizeWarnings);
  const entries = Array.isArray(config[userId]) ? config[userId] : [];
  return entries.map((entry) => ({ ...entry }));
}

export async function removeWarning(guildId, userId, warnId) {
  const config = await loadGuildFeature(guildId, "warnings", WARNINGS_DEFAULTS, normalizeWarnings);
  const entries = Array.isArray(config[userId]) ? config[userId] : [];
  const next = entries.filter((entry) => entry.id !== warnId);
  const removed = next.length !== entries.length;

  if (removed) {
    if (next.length === 0) {
      delete config[userId];
    } else {
      config[userId] = next;
    }
  }

  return removed;
}

export async function clearWarnings(guildId, userId) {
  const config = await loadGuildFeature(guildId, "warnings", WARNINGS_DEFAULTS, normalizeWarnings);
  const entries = Array.isArray(config[userId]) ? config[userId] : [];
  const cleared = entries.length;

  if (cleared > 0) {
    delete config[userId];
  }

  return cleared;
}
