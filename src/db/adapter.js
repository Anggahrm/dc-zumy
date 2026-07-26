import { eq } from "drizzle-orm";
import { closeDb, getDb } from "#db/client.js";
import { createDefaultBotData, createDefaultGuildData, createDefaultUserData } from "#db/defaults.js";
import { botData, guildsData, usersData } from "#db/schema.js";

const SAVE_DEBOUNCE_MS = 300;
const SAVE_RETRY_MAX_MS = 30_000;
const CACHE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const CACHE_IDLE_EVICT_MS = 30 * 60 * 1000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createDeepProxy(target, onChange) {
  if (target === null || typeof target !== "object") {
    return target;
  }

  const handler = {
    get(obj, prop) {
      const value = obj[prop];
      if (value !== null && typeof value === "object") {
        return new Proxy(value, handler);
      }

      return value;
    },
    set(obj, prop, value) {
      if (obj[prop] !== value) {
        obj[prop] = value;
        onChange();
      }

      return true;
    },
    deleteProperty(obj, prop) {
      if (prop in obj) {
        delete obj[prop];
        onChange();
      }

      return true;
    },
  };

  return new Proxy(target, handler);
}

class RecordNotLoadedError extends Error {
  constructor(collection, id) {
    super(
      `Record ${collection}:${id} has not been loaded yet. `
      + "Await db.loadUser(id) / db.loadGuild(id) before reading or writing it.",
    );
    this.name = "RecordNotLoadedError";
  }
}

class DatabaseAdapter {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.usersCache = new Map();
    this.guildsCache = new Map();
    this.botCache = null;
    this.pendingLoads = new Map();
    this.pendingSaves = new Map();
    this.saveChain = new Map();
    this.saveTimers = new Map();
    this.dirtyRecords = new Set();
    this.loadedRecords = new Set();
    this.revisions = new Map();
    this.saveFailures = new Map();
    this.lastAccess = new Map();
    this.sweepTimer = null;
    this.saveDebounceMs = SAVE_DEBOUNCE_MS;
    this.validIdPattern = /^\d{5,30}$/;

    this.data = {
      users: this.createCollectionProxy("users"),
      guilds: this.createCollectionProxy("guilds"),
    };

    Object.defineProperty(this.data, "bot", {
      enumerable: true,
      configurable: false,
      get: () => this.getBotProxy(),
    });
  }

  user(id) {
    return this.data.users[id];
  }

  async loadUser(id) {
    const safeId = this.normalizeId(id);
    if (!safeId) {
      throw new Error("Invalid user id.");
    }

    this.ensureRecord("users", safeId);
    await this.loadRecord("users", safeId);
    this.assertLoaded("users", safeId);
    return this.user(safeId);
  }

  guild(id) {
    return this.data.guilds[id];
  }

  async loadGuild(id, options = {}) {
    const { preferCache = false } = options;
    const safeId = this.normalizeId(id);
    if (!safeId) {
      throw new Error("Invalid guild id.");
    }

    if (preferCache && this.loadedRecords.has(`guilds:${safeId}`)) {
      this.touch("guilds", safeId);
      return this.guild(safeId);
    }

    this.ensureRecord("guilds", safeId);
    await this.loadRecord("guilds", safeId);
    this.assertLoaded("guilds", safeId);
    return this.guild(safeId);
  }

  get bot() {
    return this.data.bot;
  }

  getBotProxy() {
    const value = this.ensureBotData();
    return createDeepProxy(value, () => this.queueSave("bot", "global"));
  }

  normalizeId(id) {
    if (typeof id !== "string") return null;
    const next = id.trim();
    if (!this.validIdPattern.test(next)) return null;
    return next;
  }

  assertLoaded(collection, id) {
    if (!this.loadedRecords.has(`${collection}:${id}`)) {
      throw new RecordNotLoadedError(collection, id);
    }
  }

  touch(collection, id) {
    this.lastAccess.set(`${collection}:${id}`, Date.now());
  }

  createCollectionProxy(collection) {
    return new Proxy(
      {},
      {
        get: (_, id) => {
          if (typeof id !== "string") return undefined;
          if (id === "then" || id === "catch" || id === "finally") return undefined;
          const safeId = this.normalizeId(id);
          if (!safeId) return undefined;

          const record = this.ensureRecord(collection, safeId);
          // Guard against silent lost-updates: reads/writes on a record whose
          // initial DB load has not completed would let a later save overwrite
          // the stored row with defaults. Fail loudly instead.
          this.assertLoaded(collection, safeId);
          return createDeepProxy(record, () => this.queueSave(collection, safeId));
        },
        set: (_, id, value) => {
          const safeId = this.normalizeId(id);
          if (!safeId) return false;
          if (!isPlainObject(value)) {
            throw new TypeError(`Records in '${collection}' must be plain objects.`);
          }
          const cache = this.getCollectionCache(collection);
          cache.set(safeId, value);
          this.loadedRecords.add(`${collection}:${safeId}`);
          this.touch(collection, safeId);
          this.queueSave(collection, safeId);
          return true;
        },
      }
    );
  }

  ensureRecord(collection, id) {
    this.touch(collection, id);
    const cache = this.getCollectionCache(collection);
    const existing = cache.get(id);
    if (!existing) {
      const value = this.createDefaultRecord(collection, id);
      cache.set(id, value);
      void this.loadRecord(collection, id);
      return value;
    }

    return existing;
  }

  ensureBotData() {
    if (!this.botCache) {
      this.botCache = createDefaultBotData();
      void this.loadRecord("bot", "global");
    }

    return this.botCache;
  }

  async loadBot() {
    this.ensureBotData();
    await this.loadRecord("bot", "global");
    return this.bot;
  }

  async userLoaded(id) {
    return this.loadUser(id);
  }

  async guildLoaded(id) {
    return this.loadGuild(id);
  }

  async botLoaded() {
    return this.loadBot();
  }

  getCollectionCache(collection) {
    if (collection === "users") return this.usersCache;
    if (collection === "guilds") return this.guildsCache;
    throw new Error(`Unknown collection: ${collection}`);
  }

  createDefaultRecord(collection, id) {
    if (collection === "users") return createDefaultUserData(id);
    if (collection === "guilds") return createDefaultGuildData(id);
    throw new Error(`Unknown collection: ${collection}`);
  }

  async init() {
    if (this.initialized) return;
    this.db = getDb();
    this.initialized = true;

    await this.loadRecord("bot", "global");
    this.startSweeper();
  }

  startSweeper() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweepIdleRecords(), CACHE_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  sweepIdleRecords() {
    const cutoff = Date.now() - CACHE_IDLE_EVICT_MS;
    for (const [key, accessedAt] of this.lastAccess) {
      if (accessedAt > cutoff) continue;
      const [collection, id] = key.split(":");
      if (collection === "bot") continue;
      if (
        this.dirtyRecords.has(key)
        || this.pendingLoads.has(key)
        || this.pendingSaves.has(key)
        || this.saveTimers.has(key)
      ) {
        continue;
      }

      this.getCollectionCache(collection).delete(id);
      this.loadedRecords.delete(key);
      this.revisions.delete(key);
      this.saveFailures.delete(key);
      this.lastAccess.delete(key);
    }
  }

  async loadRecord(collection, id) {
    if (!this.initialized) return;

    const key = `${collection}:${id}`;
    if (this.pendingLoads.has(key)) return this.pendingLoads.get(key);

    const task = this.loadRecordInternal(collection, id).finally(() => {
      this.pendingLoads.delete(key);
    });
    this.pendingLoads.set(key, task);
    return task;
  }

  async loadRecordInternal(collection, id) {
    const key = `${collection}:${id}`;

    try {
      if (collection === "users") {
        const [row] = await this.db.select().from(usersData).where(eq(usersData.id, id)).limit(1);
        if (row?.data && !this.dirtyRecords.has(key)) {
          const current = this.usersCache.get(id);
          if (current) {
            Object.assign(current, row.data);
          }
        }
        this.loadedRecords.add(key);
        return;
      }

      if (collection === "guilds") {
        const [row] = await this.db.select().from(guildsData).where(eq(guildsData.id, id)).limit(1);
        if (row?.data && !this.dirtyRecords.has(key)) {
          const current = this.guildsCache.get(id);
          if (current) {
            Object.assign(current, row.data);
          }
        }
        this.loadedRecords.add(key);
        return;
      }

      if (collection === "bot") {
        const [row] = await this.db.select().from(botData).where(eq(botData.key, id)).limit(1);
        if (!this.botCache) {
          this.botCache = createDefaultBotData();
        }
        if (row?.data && !this.dirtyRecords.has(key)) {
          Object.assign(this.botCache, row.data);
        }
        this.loadedRecords.add(key);
      }
    } catch (error) {
      console.error("Database load failed", {
        collection,
        id,
        message: error?.message || String(error),
      });
    }
  }

  getRevision(key) {
    return this.revisions.get(key) ?? 0;
  }

  nextRevision(key) {
    const next = this.getRevision(key) + 1;
    this.revisions.set(key, next);
    return next;
  }

  getRetryDelay(key) {
    const failures = this.saveFailures.get(key) ?? 0;
    if (failures === 0) return this.saveDebounceMs;
    return Math.min(SAVE_RETRY_MAX_MS, this.saveDebounceMs * 2 ** failures);
  }

  scheduleSave(collection, id, { markDirty = true } = {}) {
    if (!this.initialized) return;

    const key = `${collection}:${id}`;
    const revision = markDirty ? this.nextRevision(key) : this.getRevision(key);
    this.dirtyRecords.add(key);
    this.touch(collection, id);

    const existing = this.saveTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.saveTimers.delete(key);
      this.enqueueSave(collection, id, revision);
    }, this.getRetryDelay(key));

    this.saveTimers.set(key, timer);
  }

  queueSave(collection, id) {
    this.scheduleSave(collection, id, { markDirty: true });
  }

  enqueueSave(collection, id, scheduledRevision) {
    const key = `${collection}:${id}`;
    const previous = this.saveChain.get(key) ?? Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(() => this.saveRecord(collection, id, scheduledRevision))
      .then(() => {
        this.saveFailures.delete(key);
      })
      .catch((error) => {
        const failures = (this.saveFailures.get(key) ?? 0) + 1;
        this.saveFailures.set(key, failures);
        console.error("Database save failed", {
          collection,
          id,
          attempt: failures,
          nextRetryMs: this.getRetryDelay(key),
          message: error?.message || String(error),
        });
        this.scheduleSave(collection, id, { markDirty: false });
      })
      .finally(() => {
        if (this.pendingSaves.get(key) === task) {
          this.pendingSaves.delete(key);
        }
        if (this.saveChain.get(key) === task) {
          this.saveChain.delete(key);
        }
      });

    this.saveChain.set(key, task);
    this.pendingSaves.set(key, task);
  }

  async saveRecord(collection, id, scheduledRevision) {
    if (!this.initialized) return;

    const key = `${collection}:${id}`;

    if (collection === "users" || collection === "guilds") {
      const cached = this.getCollectionCache(collection).get(id);
      if (!cached) {
        // Never persist synthesized defaults over a row we no longer hold.
        console.warn("Skipped save for evicted record", { collection, id });
        this.dirtyRecords.delete(key);
        return;
      }

      const data = clone(cached);
      const table = collection === "users" ? usersData : guildsData;
      await this.db
        .insert(table)
        .values({ id, data, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: table.id,
          set: {
            data,
            updatedAt: new Date(),
          },
        });
      if (this.getRevision(key) === scheduledRevision) {
        this.dirtyRecords.delete(key);
      }
      return;
    }

    if (collection === "bot") {
      const data = clone(this.botCache ?? createDefaultBotData());
      await this.db
        .insert(botData)
        .values({ key: "global", data, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: botData.key,
          set: {
            data,
            updatedAt: new Date(),
          },
        });
      if (this.getRevision(key) === scheduledRevision) {
        this.dirtyRecords.delete(key);
      }
    }
  }

  async flushAll() {
    const keys = new Set([...this.saveTimers.keys(), ...this.dirtyRecords]);
    for (const key of keys) {
      const timer = this.saveTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.saveTimers.delete(key);
      }

      const [collection, id] = key.split(":");
      this.enqueueSave(collection, id, this.getRevision(key));
    }

    await Promise.allSettled(Array.from(this.saveChain.values()));
  }

  async close() {
    if (!this.initialized) return;
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    await this.flushAll();
    await Promise.allSettled(Array.from(this.pendingLoads.values()));
    await Promise.allSettled(Array.from(this.pendingSaves.values()));
    await closeDb();
    this.initialized = false;
  }
}

export const db = new DatabaseAdapter();

if (typeof global !== "undefined") {
  global.db = db;
}
