import { asc, eq, lte } from "drizzle-orm";
import { getDb } from "#db/client.js";
import { scheduledJobs } from "#db/schema.js";

const TICK_INTERVAL_MS = 15_000;
const BATCH_SIZE = 20;

export function createScheduler({ logger }) {
  const handlers = new Map();
  let timer = null;
  let ticking = false;

  function registerHandler(type, fn) {
    handlers.set(type, fn);
  }

  async function schedule({ type, runAt, guildId = null, payload = {}, dedupeKey = null }) {
    const db = getDb();

    if (dedupeKey) {
      await db.delete(scheduledJobs).where(eq(scheduledJobs.dedupeKey, dedupeKey));
    }

    const [row] = await db
      .insert(scheduledJobs)
      .values({
        type,
        guildId,
        dedupeKey,
        runAt: runAt instanceof Date ? runAt : new Date(runAt),
        payload,
      })
      .returning();
    return row;
  }

  async function cancelByKey(dedupeKey) {
    const db = getDb();
    const rows = await db.delete(scheduledJobs).where(eq(scheduledJobs.dedupeKey, dedupeKey)).returning();
    return rows.length > 0;
  }

  async function tick() {
    if (ticking) return;
    ticking = true;

    try {
      const db = getDb();
      const due = await db
        .select()
        .from(scheduledJobs)
        .where(lte(scheduledJobs.runAt, new Date()))
        .orderBy(asc(scheduledJobs.runAt))
        .limit(BATCH_SIZE);

      for (const job of due) {
        // Claim before running so a crash mid-handler can't cause a tight
        // rerun loop; jobs are best-effort, not exactly-once.
        await db.delete(scheduledJobs).where(eq(scheduledJobs.id, job.id));

        const handler = handlers.get(job.type);
        if (!handler) {
          logger?.warn("No handler for scheduled job", { jobId: job.id, type: job.type });
          continue;
        }

        try {
          await handler(job);
        } catch (error) {
          logger?.error("Scheduled job failed", {
            jobId: job.id,
            type: job.type,
            guildId: job.guildId,
            message: error?.message || String(error),
          });
        }
      }
    } catch (error) {
      logger?.error("Scheduler tick failed", { message: error?.message || String(error) });
    } finally {
      ticking = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
    timer.unref?.();
    void tick();
    logger?.info("Scheduler started", { tickMs: TICK_INTERVAL_MS });
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    registerHandler,
    schedule,
    cancelByKey,
    start,
    stop,
    tick,
  };
}
