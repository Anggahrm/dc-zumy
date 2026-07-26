export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

export function formatDiscordTimestamp(now = new Date(), style = "F") {
  return `<t:${Math.floor(now.getTime() / 1000)}:${style}>`;
}

const DURATION_UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function parseDuration(input) {
  if (typeof input !== "string") return null;
  const text = input.trim().toLowerCase().replaceAll(/\s+/g, "");
  if (!text) return null;

  // A bare number means minutes.
  if (/^\d+$/.test(text)) {
    return Number(text) * DURATION_UNITS.m;
  }

  if (!/^(\d+[smhdw])+$/.test(text)) {
    return null;
  }

  let totalMs = 0;
  for (const [, amount, unit] of text.matchAll(/(\d+)([smhdw])/g)) {
    totalMs += Number(amount) * DURATION_UNITS[unit];
  }

  return totalMs > 0 ? totalMs : null;
}

function toDateParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function daysInMonthUTC(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function formatElapsedSince(timestamp, now = Date.now()) {
  if (!timestamp) return "unknown";

  const from = new Date(timestamp);
  const to = new Date(now);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return "unknown";
  }

  const start = toDateParts(from);
  const end = toDateParts(to);

  let years = end.year - start.year;
  let months = end.month - start.month;
  let days = end.day - start.day;

  if (days < 0) {
    const prevMonth = end.month - 1 < 0 ? 11 : end.month - 1;
    const prevYear = end.month - 1 < 0 ? end.year - 1 : end.year;
    days += daysInMonthUTC(prevYear, prevMonth);
    months -= 1;
  }

  if (months < 0) {
    months += 12;
    years -= 1;
  }

  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} and ${parts[2]}`;
}
