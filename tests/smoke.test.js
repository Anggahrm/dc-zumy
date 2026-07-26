import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { loadCommands } from "#core/loader/commands.js";
import { loadEvents } from "#core/loader/events.js";
import { parseYoutubeChannelId, parseYoutubeFeed } from "#services/alerts.js";
import { checkMessage, compileWordRegex, isAutomodActive, trackSpam } from "#services/automod.js";
import { isBirthdayOn, isValidBirthday } from "#services/birthdays.js";
import { renderGreeterTemplate } from "#services/greeter.js";
import { getDictionaries, translate } from "#services/i18n.js";
import { sanitizeMenuName } from "#services/rolemenus.js";
import { sanitizeTagName } from "#services/tags.js";
import { expForLevel, levelFromExp, levelProgress } from "#utils/level.js";
import { PROJECT_ROOT } from "#utils/paths.js";
import { formatDuration, parseDuration } from "#utils/time.js";

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

describe("command loading", () => {
  test("all command modules load, validate, and serialize", async () => {
    const registry = await loadCommands({ logger: noopLogger, rootDir: PROJECT_ROOT });
    expect(registry.size()).toBeGreaterThan(0);

    const payload = registry.allAsJson();
    expect(payload.length).toBe(registry.size());

    for (const command of registry.all()) {
      expect(typeof command.category).toBe("string");
      expect(typeof command.execute).toBe("function");
    }
  });

  test("string option choices stay within Discord's limit of 25", async () => {
    const registry = await loadCommands({ logger: noopLogger, rootDir: PROJECT_ROOT });
    for (const command of registry.allAsJson()) {
      const stack = [...(command.options ?? [])];
      while (stack.length > 0) {
        const option = stack.pop();
        if (option.choices) {
          expect(option.choices.length).toBeLessThanOrEqual(25);
        }
        if (option.options) {
          stack.push(...option.options);
        }
      }
    }
  });
});

describe("event loading", () => {
  test("all event modules load and register", async () => {
    const fakeClient = new EventEmitter();
    await loadEvents({ client: fakeClient, logger: noopLogger, rootDir: PROJECT_ROOT });
    expect(fakeClient.eventNames().length).toBeGreaterThan(0);
  });
});

describe("parseDuration", () => {
  test("parses unit strings", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(parseDuration("1d")).toBe(86_400_000);
    expect(parseDuration("1h30m")).toBe(5_400_000);
  });

  test("bare numbers mean minutes", () => {
    expect(parseDuration("15")).toBe(900_000);
  });

  test("rejects invalid input", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("10x")).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });
});

describe("levels", () => {
  test("level curve is monotonic", () => {
    expect(levelFromExp(0)).toBe(1);
    expect(levelFromExp(99)).toBe(1);
    expect(levelFromExp(100)).toBe(2);
    expect(levelFromExp(400)).toBe(3);
    expect(expForLevel(2)).toBe(100);
  });

  test("progress adds up", () => {
    const progress = levelProgress(150);
    expect(progress.level).toBe(2);
    expect(progress.current).toBe(50);
    expect(progress.needed).toBe(300);
  });
});

describe("automod rules", () => {
  const config = {
    antiInvite: true,
    bannedWords: ["badword"],
    mentionLimit: 3,
    linkFilter: false,
    linkAllowlist: [],
    spamEnabled: false,
  };

  function fakeMessage(content, mentions = 0) {
    return {
      content,
      guildId: "100000000000000001",
      mentions: { users: { size: mentions }, roles: { size: 0 } },
    };
  }

  test("detects invites", () => {
    expect(checkMessage(config, fakeMessage("join discord.gg/abc123"))?.rule).toBe("anti_invite");
    expect(checkMessage(config, fakeMessage("join discord.com/invite/abc"))?.rule).toBe("anti_invite");
    expect(checkMessage(config, fakeMessage("hello world"))).toBeNull();
  });

  test("detects banned words case-insensitively", () => {
    expect(checkMessage(config, fakeMessage("you BADWORD!"))?.rule).toBe("banned_word");
  });

  test("detects mention spam at the limit", () => {
    expect(checkMessage(config, fakeMessage("hi", 3))?.rule).toBe("mention_spam");
    expect(checkMessage(config, fakeMessage("hi", 2))).toBeNull();
  });

  test("inactive config short-circuits", () => {
    expect(isAutomodActive({ antiInvite: false, bannedWords: [], mentionLimit: 0, linkFilter: false, spamEnabled: false })).toBe(false);
    expect(isAutomodActive(config)).toBe(true);
  });

  test("word matching respects word boundaries", () => {
    const regex = compileWordRegex(["ass"]);
    expect(regex.test("class dismissed")).toBe(false);
    expect(regex.test("you ass!")).toBe(true);
    expect(regex.test("ASS")).toBe(true);
  });

  test("wildcard words match extensions", () => {
    const regex = compileWordRegex(["spam*"]);
    expect(regex.test("stop the spammers")).toBe(true);
    expect(regex.test("spam")).toBe(true);
    expect(regex.test("antispam")).toBe(false);
  });

  test("link filter honors the domain allowlist", () => {
    const linkConfig = {
      ...config,
      antiInvite: false,
      bannedWords: [],
      mentionLimit: 0,
      linkFilter: true,
      linkAllowlist: ["youtube.com"],
    };
    expect(checkMessage(linkConfig, fakeMessage("https://youtube.com/watch?v=x"))).toBeNull();
    expect(checkMessage(linkConfig, fakeMessage("https://music.youtube.com/abc"))).toBeNull();
    expect(checkMessage(linkConfig, fakeMessage("https://evil.example.com/x"))?.rule).toBe("link_filter");
  });

  test("spam tracker triggers on message rate", () => {
    const options = { maxMessages: 4, intervalMs: 5000, duplicateLimit: 10 };
    const base = 1_000_000;
    let violation = null;
    for (let i = 0; i < 4; i += 1) {
      violation = trackSpam("g1", "u1", `msg ${i}`, options, base + i * 100);
    }
    expect(violation?.rule).toBe("spam");
  });

  test("spam tracker triggers on duplicates", () => {
    const options = { maxMessages: 20, intervalMs: 5000, duplicateLimit: 3 };
    const base = 2_000_000;
    let violation = null;
    for (let i = 0; i < 3; i += 1) {
      violation = trackSpam("g2", "u2", "same text", options, base + i * 100);
    }
    expect(violation?.rule).toBe("spam");
  });
});

describe("rolemenus", () => {
  test("sanitizes menu names", () => {
    expect(sanitizeMenuName("Colors")).toBe("colors");
    expect(sanitizeMenuName("game-roles")).toBe("game-roles");
    expect(sanitizeMenuName("bad name")).toBeNull();
  });
});

describe("youtube alerts", () => {
  test("parses channel ids from raw ids and urls", () => {
    expect(parseYoutubeChannelId("UC_x5XG1OV2P6uZZ5FSM9Ttw")).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
    expect(parseYoutubeChannelId("https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw")).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
    expect(parseYoutubeChannelId("@somehandle")).toBeNull();
  });

  test("parses feed xml", () => {
    const xml = `<feed><author><name>Test Channel</name></author>
      <entry><yt:videoId>abc123DEF45</yt:videoId><title>Video &amp; One</title></entry>
      <entry><yt:videoId>xyz789GHI01</yt:videoId><title>Video Two</title></entry></feed>`;
    const feed = parseYoutubeFeed(xml);
    expect(feed.channelName).toBe("Test Channel");
    expect(feed.videos.length).toBe(2);
    expect(feed.videos[0]).toEqual({
      videoId: "abc123DEF45",
      title: "Video & One",
      url: "https://www.youtube.com/watch?v=abc123DEF45",
      channelName: "Test Channel",
    });
  });
});

describe("birthdays", () => {
  test("validates dates", () => {
    expect(isValidBirthday(29, 2)).toBe(true);
    expect(isValidBirthday(30, 2)).toBe(false);
    expect(isValidBirthday(31, 4)).toBe(false);
    expect(isValidBirthday(15, 8)).toBe(true);
  });

  test("celebrates Feb 29 on Feb 28 in non-leap years", () => {
    const entry = { day: 29, month: 2 };
    expect(isBirthdayOn(entry, new Date(Date.UTC(2026, 1, 28)))).toBe(true);
    expect(isBirthdayOn(entry, new Date(Date.UTC(2028, 1, 28)))).toBe(false);
    expect(isBirthdayOn(entry, new Date(Date.UTC(2028, 1, 29)))).toBe(true);
  });
});

describe("greeter templates", () => {
  test("replaces all variables", () => {
    const rendered = renderGreeterTemplate("Hi {user} aka {username}, welcome to {server} (#{count})", {
      user: { id: "123456789012345678", username: "zumy", tag: "zumy" },
      guild: { name: "Test Server", memberCount: 42 },
    });
    expect(rendered).toBe("Hi <@123456789012345678> aka zumy, welcome to Test Server (#42)");
  });
});

describe("tags", () => {
  test("sanitizes names", () => {
    expect(sanitizeTagName("Rules")).toBe("rules");
    expect(sanitizeTagName("faq-1")).toBe("faq-1");
    expect(sanitizeTagName("bad name")).toBeNull();
    expect(sanitizeTagName("")).toBeNull();
  });
});

describe("i18n", () => {
  test("every registered key exists in both languages with matching placeholders", async () => {
    // Loading all commands registers their dictionaries.
    await loadCommands({ logger: noopLogger, rootDir: PROJECT_ROOT });
    const { en, id } = getDictionaries();

    const missingId = Object.keys(en).filter((key) => !(key in id));
    const missingEn = Object.keys(id).filter((key) => !(key in en));
    expect(missingId).toEqual([]);
    expect(missingEn).toEqual([]);

    const placeholderMismatches = Object.keys(en).filter((key) => {
      const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
      return vars(en[key]) !== vars(id[key]);
    });
    expect(placeholderMismatches).toEqual([]);

    expect(Object.keys(en).length).toBeGreaterThan(400);
  });

  test("translates with variables and falls back to english", () => {
    expect(translate("id", "handler.cooldown", { seconds: 5 })).toBe("Sabar dulu ya. Coba lagi dalam 5 detik.");
    expect(translate("en", "handler.cooldown", { seconds: 5 })).toBe("You're a bit fast. Try again in 5s.");
    expect(translate("xx", "handler.maintenance")).toBe("The bot is under maintenance right now. Please try again later.");
    expect(translate("id", "greeter.welcome_default", { user: "@u", server: "S" })).toContain("selamat datang di S");
  });
});

describe("duration formatting", () => {
  test("formats seconds", () => {
    expect(formatDuration(3661)).toBe("1h 1m 1s");
    expect(formatDuration(0)).toBe("0s");
  });
});
