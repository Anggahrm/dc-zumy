import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { loadCommands } from "#core/loader/commands.js";
import { loadEvents } from "#core/loader/events.js";
import { checkMessage, isAutomodActive } from "#services/automod.js";
import { renderGreeterTemplate } from "#services/greeter.js";
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
  const config = { antiInvite: true, bannedWords: ["badword"], mentionLimit: 3 };

  function fakeMessage(content, mentions = 0) {
    return {
      content,
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
    expect(isAutomodActive({ antiInvite: false, bannedWords: [], mentionLimit: 0 })).toBe(false);
    expect(isAutomodActive(config)).toBe(true);
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

describe("duration formatting", () => {
  test("formats seconds", () => {
    expect(formatDuration(3661)).toBe("1h 1m 1s");
    expect(formatDuration(0)).toBe("0s");
  });
});
