import { eq } from "drizzle-orm";
import { closeDb, getDb } from "#db/client.js";
import { createDefaultBotData, createDefaultGuildData, createDefaultUserData } from "#db/defaults.js";
import { botData, guildsData, usersData } from "#db/schema.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
    this.revisions = new Map();
    this.saveDebounceMs = 300;
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
    return this.user(safeId);
  }

  guild(id) {
    return this.data.guilds[id];
  }

  async loadGuild(id) {
    const safeId = this.normalizeId(id);
    if (!safeId) {
      throw new Error("Invalid guild id.");
    }

    this.ensureRecord("guilds", safeId);
    await this.loadRecord("guilds", safeId);
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
          return createDeepProxy(record, () => this.queueSave(collection, safeId));
        },
        set: (_, id, value) => {
          const safeId = this.normalizeId(id);
          if (!safeId) return false;
          const cache = this.getCollectionCache(collection);
          cache.set(safeId, value);
          this.queueSave(collection, safeId);
          return true;
        },
      }
    );
  }

  ensureRecord(collection, id) {
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

  scheduleSave(collection, id, { markDirty = true } = {}) {
    if (!this.initialized) return;

    const key = `${collection}:${id}`;
    const revision = markDirty ? this.nextRevision(key) : this.getRevision(key);
    this.dirtyRecords.add(key);

    const existing = this.saveTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.saveTimers.delete(key);
      this.enqueueSave(collection, id, revision);
    }, this.saveDebounceMs);

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
      .catch((error) => {
        console.error("Database save failed", {
          collection,
          id,
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

    if (collection === "users") {
      const data = clone(this.usersCache.get(id) ?? createDefaultUserData(id));
      await this.db
        .insert(usersData)
        .values({ id, data, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: usersData.id,
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

    if (collection === "guilds") {
      const data = clone(this.guildsCache.get(id) ?? createDefaultGuildData(id));
      await this.db
        .insert(guildsData)
        .values({ id, data, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: guildsData.id,
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
    const entries = Array.from(this.saveTimers.keys());
    for (const key of entries) {
      const timer = this.saveTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.saveTimers.delete(key);
      }

      const [collection, id] = key.split(":");
      await this.saveRecord(collection, id, this.getRevision(key)).catch((error) => {
        console.error("Database flush save failed", {
          collection,
          id,
          message: error?.message || String(error),
        });
      });
    }
  }

  async close() {
    if (!this.initialized) return;
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
