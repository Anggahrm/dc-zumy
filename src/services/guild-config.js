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

function sanitizeChannelId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function loadGuildFeature(guildId, featureKey, defaults, normalize) {
  await global.db.loadGuild(guildId);
  const guild = global.db.data.guilds[guildId];

  if (!guild[featureKey] || typeof guild[featureKey] !== "object" || Array.isArray(guild[featureKey])) {
    guild[featureKey] = clone(defaults);
  }

  if (typeof normalize === "function") {
    normalize(guild[featureKey]);
  }

  return guild[featureKey];
}

export const guildFeatureUtils = {
  normalizeRoleIds,
  sanitizeChannelId,
};
