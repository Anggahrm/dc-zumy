import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";
import { translate } from "#services/i18n.js";

export const MAX_BIRTHDAY_ENTRIES = 1000;

const BIRTHDAYS_DEFAULTS = {
  channelId: null,
  roleId: null,
  message: null,
  entries: {},
  activeRoleUserIds: [],
};

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function normalizeBirthdays(config) {
  config.channelId = guildFeatureUtils.sanitizeChannelId(config.channelId);
  if (typeof config.roleId !== "string") config.roleId = null;
  if (typeof config.message !== "string" || !config.message.trim()) config.message = null;
  if (!config.entries || typeof config.entries !== "object" || Array.isArray(config.entries)) {
    config.entries = {};
  }
  if (!Array.isArray(config.activeRoleUserIds)) config.activeRoleUserIds = [];

  for (const [userId, entry] of Object.entries(config.entries)) {
    if (!isValidBirthday(entry?.day, entry?.month)) {
      delete config.entries[userId];
    }
  }
}

export function isValidBirthday(day, month) {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

export async function getBirthdaysConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "birthdays", BIRTHDAYS_DEFAULTS, normalizeBirthdays, options);
  return {
    channelId: config.channelId,
    roleId: config.roleId,
    message: config.message,
    entries: Object.fromEntries(Object.entries(config.entries).map(([userId, entry]) => [userId, { ...entry }])),
    activeRoleUserIds: [...config.activeRoleUserIds],
  };
}

export async function updateBirthdaysConfig(guildId, mutate) {
  const config = await loadGuildFeature(guildId, "birthdays", BIRTHDAYS_DEFAULTS, normalizeBirthdays);
  const result = mutate(config);
  normalizeBirthdays(config);
  return result;
}

export async function setBirthday(guildId, userId, day, month) {
  return updateBirthdaysConfig(guildId, (config) => {
    if (!config.entries[userId] && Object.keys(config.entries).length >= MAX_BIRTHDAY_ENTRIES) {
      return false;
    }
    config.entries = { ...config.entries, [userId]: { day, month } };
    return true;
  });
}

export async function removeBirthday(guildId, userId) {
  return updateBirthdaysConfig(guildId, (config) => {
    if (!config.entries[userId]) return false;
    const next = { ...config.entries };
    delete next[userId];
    config.entries = next;
    return true;
  });
}

// Whether an entry falls on `date` (UTC). Feb 29 birthdays are celebrated on
// Feb 28 in non-leap years.
export function isBirthdayOn(entry, date) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if (entry.month === month && entry.day === day) return true;

  if (entry.month === 2 && entry.day === 29 && month === 2 && day === 28) {
    const year = date.getUTCFullYear();
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return !isLeap;
  }

  return false;
}

export function nextUtcMidnight(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 5));
  return next;
}

export function upcomingBirthdays(entries, now = new Date(), limit = 10) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Object.entries(entries)
    .map(([userId, entry]) => {
      let next = Date.UTC(now.getUTCFullYear(), entry.month - 1, entry.day);
      if (next < today) {
        next = Date.UTC(now.getUTCFullYear() + 1, entry.month - 1, entry.day);
      }
      return { userId, entry, next };
    })
    .sort((a, b) => a.next - b.next)
    .slice(0, limit);
}

export function renderBirthdayMessage(template, { userId, guildName, language = "en" }) {
  const text = template || translate(language, "birthday.default");
  return text
    .replaceAll("{user}", `<@${userId}>`)
    .replaceAll("{server}", guildName);
}
