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
    "perm.owner_only": "This one is owner-only.",
    "perm.guild_only": "This command only works in a server.",
    "perm.admin_needed": "You need Administrator permission for this command.",
    "perm.member_perm": "You need the **{permission}** permission for this command.",
    "perm.unresolved": "I couldn't resolve your permissions here.",
    "confirm.title": "Are you sure?",
    "confirm.yes": "Confirm",
    "confirm.no": "Cancel",
    "confirm.cancelled": "Cancelled — nothing was changed.",
    "confirm.timeout": "Confirmation timed out — nothing was changed.",
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
    "perm.owner_only": "Command ini khusus owner bot.",
    "perm.guild_only": "Command ini hanya bisa dipakai di server.",
    "perm.admin_needed": "Kamu butuh permission Administrator untuk command ini.",
    "perm.member_perm": "Kamu butuh permission **{permission}** untuk command ini.",
    "perm.unresolved": "Aku tidak bisa membaca permission-mu di sini.",
    "confirm.title": "Yakin?",
    "confirm.yes": "Lanjutkan",
    "confirm.no": "Batal",
    "confirm.cancelled": "Dibatalkan — tidak ada yang berubah.",
    "confirm.timeout": "Konfirmasi kedaluwarsa — tidak ada yang berubah.",
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

// Commands register their own strings at module load, co-located with the
// command code, namespaced as `<namespace>.<key>`. Later registrations for
// the same namespace replace earlier ones (hot reload safe).
export function registerStrings(namespace, dictionaries) {
  for (const lang of SUPPORTED_LANGUAGES) {
    const entries = dictionaries[lang];
    if (!entries) continue;
    for (const [key, text] of Object.entries(entries)) {
      STRINGS[lang][`${namespace}.${key}`] = text;
    }
  }
}

export function translate(language, key, vars = {}) {
  const lang = SUPPORTED_LANGUAGES.includes(language) ? language : "en";
  let text = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

// Test hook: full dictionaries for coverage assertions.
export function getDictionaries() {
  return STRINGS;
}

// Bound translator for one already-resolved language.
export function makeTranslator(language) {
  return (key, vars = {}) => translate(language, key, vars);
}

// Convenience: resolve the guild language and translate in one call.
export async function t(guildId, key, vars = {}) {
  const language = await getGuildLanguage(guildId);
  return translate(language, key, vars);
}
