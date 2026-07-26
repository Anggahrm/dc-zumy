import { loadGuildFeature } from "#services/guild-config.js";

export const SUPPORTED_LANGUAGES = ["en", "id"];

const LOCALE_DEFAULTS = { language: "en" };

function normalizeLocale(config) {
  if (!SUPPORTED_LANGUAGES.includes(config.language)) config.language = "en";
}

const STRINGS = {
  en: {
    "handler.command_not_found": "I couldn't find that command.",
    "handler.something_wrong": "Something went wrong while running that command.",
    "handler.cooldown": "You're a bit fast. Try again in {seconds}s.",
    "handler.maintenance": "The bot is under maintenance right now. Please try again later.",
    "handler.component_error": "Something broke in this menu action.",
    "handler.click_fast": "You're clicking a bit fast. Try again in a second.",
    "greeter.welcome_default": "Hi {user} Welcome to {server}, Have a nice day",
    "greeter.leave_default": "Bye {user} from {server}, Have a nice day",
    "levels.levelup_default": "🎉 {user} reached level **{level}**!",
    "birthday.default": "🎂 Happy birthday {user}! Have a great day!",
    "afk.welcome_back": "Welcome back {user}! Your AFK is cleared (away since {since}).",
    "afk.is_afk": "💤 {user} is AFK ({since}): {reason}",
  },
  id: {
    "handler.command_not_found": "Command itu tidak ketemu.",
    "handler.something_wrong": "Ada yang salah saat menjalankan command itu.",
    "handler.cooldown": "Sabar dulu ya. Coba lagi dalam {seconds} detik.",
    "handler.maintenance": "Bot lagi maintenance. Coba lagi nanti ya.",
    "handler.component_error": "Ada yang rusak di aksi menu ini.",
    "handler.click_fast": "Kliknya kecepetan. Coba lagi sebentar lagi.",
    "greeter.welcome_default": "Hai {user}, selamat datang di {server}! Semoga betah ya",
    "greeter.leave_default": "Dadah {user}, sampai jumpa lagi di {server}",
    "levels.levelup_default": "🎉 {user} naik ke level **{level}**!",
    "birthday.default": "🎂 Selamat ulang tahun {user}! Semoga harimu menyenangkan!",
    "afk.welcome_back": "Selamat datang kembali {user}! Status AFK-mu dihapus (AFK sejak {since}).",
    "afk.is_afk": "💤 {user} lagi AFK ({since}): {reason}",
  },
};

export async function getGuildLanguage(guildId, options = { preferCache: true }) {
  if (!guildId) return "en";
  try {
    const config = await loadGuildFeature(guildId, "locale", LOCALE_DEFAULTS, normalizeLocale, options);
    return config.language;
  } catch {
    return "en";
  }
}

export async function setGuildLanguage(guildId, language) {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(`Unsupported language: ${language}`);
  }
  const config = await loadGuildFeature(guildId, "locale", LOCALE_DEFAULTS, normalizeLocale);
  config.language = language;
}

export function translate(language, key, vars = {}) {
  const lang = SUPPORTED_LANGUAGES.includes(language) ? language : "en";
  let text = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

// Convenience: resolve the guild language and translate in one call.
export async function t(guildId, key, vars = {}) {
  const language = await getGuildLanguage(guildId);
  return translate(language, key, vars);
}
