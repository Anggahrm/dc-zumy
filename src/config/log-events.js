export const LOG_EVENT_META = {
  deleted_messages: { key: "deleted_messages", label: "Deleted messages" },
  edited_messages: { key: "edited_messages", label: "Edited messages" },
  purged_messages: { key: "purged_messages", label: "Purged messages" },
  discord_invites: { key: "discord_invites", label: "Discord invites" },
  member_roles: { key: "member_roles", label: "Member roles" },
  name_updates: { key: "name_updates", label: "Name updates" },
  avatar_updates: { key: "avatar_updates", label: "Avatar updates" },
  bans: { key: "bans", label: "Bans" },
  unbans: { key: "unbans", label: "Unbans" },
  joins: { key: "joins", label: "Joins" },
  leaves: { key: "leaves", label: "Leaves" },
  timeouts: { key: "timeouts", label: "Timeouts" },
  remove_timeouts: { key: "remove_timeouts", label: "Remove Timeouts" },
  voice_join: { key: "voice_join", label: "Voice join" },
  voice_move: { key: "voice_move", label: "Voice move" },
  voice_leave: { key: "voice_leave", label: "Voice leave" },
  channel_create: { key: "channel_create", label: "Channel create" },
  channel_update: { key: "channel_update", label: "Channel update" },
  channel_delete: { key: "channel_delete", label: "Channel delete" },
  role_creation: { key: "role_creation", label: "Role creation" },
  role_updates: { key: "role_updates", label: "Role updates" },
  role_deletion: { key: "role_deletion", label: "Role deletion" },
  server_updates: { key: "server_updates", label: "Server updates" },
  emojis: { key: "emojis", label: "Emojis" },
  automod: { key: "automod", label: "Automod actions" },
};

export const LOG_EVENT_ORDER = Object.keys(LOG_EVENT_META);

// Logging is opt-in: every event starts disabled until an admin enables it.
export function createDefaultLogEvents() {
  const events = {};
  for (const key of LOG_EVENT_ORDER) {
    events[key] = false;
  }
  return events;
}
