import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";
import { createCard } from "#utils/respond.js";

export const MAX_SUGGESTION_LENGTH = 1000;
const MAX_STORED_ENTRIES = 200;

const SUGGESTIONS_DEFAULTS = {
  channelId: null,
  counter: 0,
  entries: {},
};

export const SUGGESTION_STATUS = {
  pending: { label: "Pending", color: 0x5865f2 },
  approved: { label: "Approved", color: 0x57f287 },
  denied: { label: "Denied", color: 0xed4245 },
  considered: { label: "Under consideration", color: 0xf1c40f },
};

function normalizeSuggestions(config) {
  config.channelId = guildFeatureUtils.sanitizeChannelId(config.channelId);
  if (!Number.isInteger(config.counter) || config.counter < 0) config.counter = 0;
  if (!config.entries || typeof config.entries !== "object" || Array.isArray(config.entries)) {
    config.entries = {};
  }
}

function trimEntries(config) {
  const numbers = Object.keys(config.entries).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  while (numbers.length > MAX_STORED_ENTRIES) {
    const oldest = numbers.shift();
    delete config.entries[String(oldest)];
  }
}

export async function getSuggestionsConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "suggestions", SUGGESTIONS_DEFAULTS, normalizeSuggestions, options);
  return { channelId: config.channelId, counter: config.counter };
}

export async function setSuggestionsChannel(guildId, channelId) {
  const config = await loadGuildFeature(guildId, "suggestions", SUGGESTIONS_DEFAULTS, normalizeSuggestions);
  config.channelId = guildFeatureUtils.sanitizeChannelId(channelId);
  return config.channelId;
}

export async function createSuggestion(guildId, { authorId, text }) {
  const config = await loadGuildFeature(guildId, "suggestions", SUGGESTIONS_DEFAULTS, normalizeSuggestions);
  if (!config.channelId) return null;

  config.counter += 1;
  const number = config.counter;
  config.entries = {
    ...config.entries,
    [String(number)]: {
      authorId,
      text: String(text).slice(0, MAX_SUGGESTION_LENGTH),
      status: "pending",
      note: null,
      messageId: null,
      up: [],
      down: [],
    },
  };
  trimEntries(config);

  return { number, channelId: config.channelId };
}

export async function getSuggestion(guildId, number) {
  const config = await loadGuildFeature(guildId, "suggestions", SUGGESTIONS_DEFAULTS, normalizeSuggestions);
  const entry = config.entries[String(number)];
  if (!entry) return null;
  return { number, channelId: config.channelId, ...entry, up: [...entry.up], down: [...entry.down] };
}

export async function updateSuggestion(guildId, number, mutate) {
  const config = await loadGuildFeature(guildId, "suggestions", SUGGESTIONS_DEFAULTS, normalizeSuggestions);
  const entry = config.entries[String(number)];
  if (!entry) return null;

  mutate(entry);
  return { number, channelId: config.channelId, ...entry, up: [...entry.up], down: [...entry.down] };
}

// Toggles a vote. direction: 'up' | 'down'. Returns the updated entry.
export async function voteSuggestion(guildId, number, userId, direction) {
  return updateSuggestion(guildId, number, (entry) => {
    const mine = direction === "up" ? "up" : "down";
    const other = mine === "up" ? "down" : "up";

    const had = entry[mine].includes(userId);
    entry[mine] = entry[mine].filter((id) => id !== userId);
    entry[other] = entry[other].filter((id) => id !== userId);
    if (!had) {
      entry[mine] = [...entry[mine], userId];
    }
  });
}

export function buildSuggestionCard(entry) {
  const status = SUGGESTION_STATUS[entry.status] ?? SUGGESTION_STATUS.pending;
  return createCard({
    color: status.color,
    title: `Suggestion #${entry.number}`,
    body: [
      entry.text,
      "",
      `- Author: <@${entry.authorId}>`,
      `- Status: **${status.label}**${entry.note ? ` — ${entry.note}` : ""}`,
      `- Votes: 👍 **${entry.up.length}** · 👎 **${entry.down.length}**`,
    ].join("\n"),
  });
}
