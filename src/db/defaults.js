import { createDefaultLogEvents } from "#config/log-events.js";

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
  return {
    id,
    greeter: {
      welcomeChannelId: null,
      leaveChannelId: null,
      welcomeMessage: null,
      leaveMessage: null,
    },
    autorole: {
      roles: [],
      blacklist: [],
    },
    logging: {
      channelId: null,
      events: createDefaultLogEvents(),
    },
    warnings: {},
    tags: {},
    automod: {
      antiInvite: false,
      bannedWords: [],
      mentionLimit: 0,
    },
  };
}

export function createDefaultBotData() {
  return {
    maintenance: false,
  };
}
