const SNIPE_TTL_MS = 5 * 60 * 1000;
const SNIPE_MAX_CHANNELS = 2000;

const snipes = new Map();

export function storeSnipe(message) {
  if (!message.channelId) return;
  if (typeof message.content !== "string" || !message.content.trim()) return;
  if (message.author?.bot) return;

  if (snipes.size > SNIPE_MAX_CHANNELS) {
    const oldest = snipes.keys().next().value;
    snipes.delete(oldest);
  }

  snipes.set(message.channelId, {
    content: message.content.slice(0, 1500),
    authorId: message.author?.id ?? null,
    authorTag: message.author?.tag ?? "Unknown user",
    avatarUrl: message.author?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
    deletedAt: Date.now(),
  });
}

export function getSnipe(channelId, now = Date.now()) {
  const entry = snipes.get(channelId);
  if (!entry) return null;
  if (now - entry.deletedAt > SNIPE_TTL_MS) {
    snipes.delete(channelId);
    return null;
  }
  return { ...entry };
}
