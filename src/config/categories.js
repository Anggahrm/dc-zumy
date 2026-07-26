// Ordered command-category metadata. `key` doubles as the folder name under
// src/commands/ and the `category` field on each command module; the array
// order is the browse order in /help (member-facing first, owner-only last).
// Localized labels and blurbs live in the help i18n namespace
// (help.cat_<key> / help.blurb_<key>).
export const COMMAND_CATEGORIES = [
  { key: "info", emoji: "ℹ️", color: 0x5865f2 },
  { key: "levels", emoji: "📈", color: 0x57f287 },
  { key: "economy", emoji: "💰", color: 0xfee75c },
  { key: "utility", emoji: "🔧", color: 0x3498db },
  { key: "community", emoji: "🎉", color: 0xeb459e },
  { key: "roles", emoji: "🎭", color: 0x9b59b6 },
  { key: "moderation", emoji: "🔨", color: 0xed4245 },
  { key: "automod", emoji: "🛡️", color: 0xe67e22 },
  { key: "server", emoji: "⚙️", color: 0x95a5a6 },
  { key: "owner", emoji: "🔒", color: 0x99aab5 },
];

export const CATEGORY_KEYS = COMMAND_CATEGORIES.map((category) => category.key);

export function getCategoryMeta(key) {
  return COMMAND_CATEGORIES.find((category) => category.key === key) ?? null;
}

export function categoryOrder(key) {
  const index = CATEGORY_KEYS.indexOf(key);
  return index === -1 ? CATEGORY_KEYS.length : index;
}
