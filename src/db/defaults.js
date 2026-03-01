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
    mode: "normal",
  };
}

export function createDefaultBotData() {
  return {
    mode: "public",
    maintenance: false,
  };
}
