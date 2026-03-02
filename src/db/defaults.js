export function createDefaultUserData(id) {
  return {
    id,
    money: 0,
    exp: 0,
    level: 1,
    nextDailyAt: 0,
  };
}

export function createDefaultGuildData(id) {
  const loggingEvents = {
    deleted_messages: true,
    edited_messages: true,
    purged_messages: false,
    discord_invites: false,
    member_roles: true,
    name_updates: true,
    avatar_updates: true,
    bans: true,
    unbans: true,
    joins: true,
    leaves: true,
    timeouts: false,
    remove_timeouts: false,
    voice_join: false,
    voice_move: false,
    voice_leave: false,
    channel_create: false,
    channel_update: false,
    channel_delete: false,
    role_creation: false,
    role_updates: false,
    role_deletion: false,
    server_updates: false,
    emojis: false,
  };

  return {
    id,
    welcome: {
      enabled: false,
      channelId: null,
      message: "Welcome, {user}.",
    },
    greeter: {
      welcomeChannelId: null,
      leaveChannelId: null,
    },
    autorole: {
      roles: [],
      blacklist: [],
    },
    logging: {
      channelId: null,
      events: loggingEvents,
    },
    mode: "normal",
  };
}

export function createDefaultBotData() {
  return {
    mode: "public",
    maintenance: false,
  };
}
