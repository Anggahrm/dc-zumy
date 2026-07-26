import { loadGuildFeature } from "#services/guild-config.js";

export const MAX_ALERTS = 5;
export const ALERT_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]{0,31}$/;
export const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

const ALERTS_DEFAULTS = {};

function normalizeAlerts(config) {
  for (const [name, entry] of Object.entries(config)) {
    if (
      !ALERT_NAME_PATTERN.test(name)
      || !entry
      || typeof entry !== "object"
      || entry.type !== "youtube"
      || typeof entry.youtubeChannelId !== "string"
      || !YOUTUBE_CHANNEL_ID_PATTERN.test(entry.youtubeChannelId)
      || typeof entry.targetChannelId !== "string"
    ) {
      delete config[name];
      continue;
    }
    if (typeof entry.message !== "string" || !entry.message.trim()) entry.message = null;
    if (typeof entry.lastVideoId !== "string") entry.lastVideoId = null;
  }
}

export function sanitizeAlertName(name) {
  const value = String(name ?? "").trim().toLowerCase();
  return ALERT_NAME_PATTERN.test(value) ? value : null;
}

// Accepts a raw channel id or a youtube.com/channel/UC... URL.
export function parseYoutubeChannelId(input) {
  const text = String(input ?? "").trim();
  if (YOUTUBE_CHANNEL_ID_PATTERN.test(text)) return text;
  const match = text.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  return match ? match[1] : null;
}

export async function getAlerts(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "alerts", ALERTS_DEFAULTS, normalizeAlerts, options);
  return Object.fromEntries(Object.entries(config).map(([name, entry]) => [name, { ...entry }]));
}

export async function createAlert(guildId, name, { youtubeChannelId, targetChannelId, message, lastVideoId }) {
  const safeName = sanitizeAlertName(name);
  if (!safeName) return { ok: false, reason: "invalid_name" };

  const config = await loadGuildFeature(guildId, "alerts", ALERTS_DEFAULTS, normalizeAlerts);
  if (config[safeName]) return { ok: false, reason: "exists" };
  if (Object.keys(config).length >= MAX_ALERTS) return { ok: false, reason: "full" };

  config[safeName] = {
    type: "youtube",
    youtubeChannelId,
    targetChannelId,
    message: message ? String(message).slice(0, 300) : null,
    lastVideoId: lastVideoId ?? null,
  };
  return { ok: true, name: safeName };
}

export async function deleteAlert(guildId, name) {
  const safeName = sanitizeAlertName(name);
  if (!safeName) return false;

  const config = await loadGuildFeature(guildId, "alerts", ALERTS_DEFAULTS, normalizeAlerts);
  if (!config[safeName]) return false;
  delete config[safeName];
  return true;
}

export async function setAlertLastVideo(guildId, name, lastVideoId) {
  const config = await loadGuildFeature(guildId, "alerts", ALERTS_DEFAULTS, normalizeAlerts);
  const entry = config[name];
  if (entry) {
    entry.lastVideoId = lastVideoId;
  }
}

// --- YouTube RSS ---

function decodeXmlEntities(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

// Fetches a channel's public upload feed — no API key needed. Returns the
// newest videos first, or null on network/parse failure.
export async function fetchYoutubeFeed(youtubeChannelId, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`,
      { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "ZumyNext-Bot/1.0" } },
    );
    if (!response.ok) return null;
    return parseYoutubeFeed(await response.text());
  } catch {
    return null;
  }
}

export function parseYoutubeFeed(xml) {
  const videos = [];
  const authorMatch = xml.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/);
  const channelName = authorMatch ? decodeXmlEntities(authorMatch[1].trim()) : "Unknown channel";

  for (const entry of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = entry[1];
    const videoId = block.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/)?.[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    if (!videoId || !title) continue;

    videos.push({
      videoId,
      title: decodeXmlEntities(title.trim()),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      channelName,
    });
    if (videos.length >= 5) break;
  }

  return { channelName, videos };
}

export function renderAlertMessage(template, { video, guildName }) {
  const text = template || "📺 **{channel}** uploaded a new video: **{title}**\n{url}";
  return text
    .replaceAll("{channel}", video.channelName)
    .replaceAll("{title}", video.title)
    .replaceAll("{url}", video.url)
    .replaceAll("{server}", guildName);
}
