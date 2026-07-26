import { asc, eq, lte } from "drizzle-orm";
import { getDb } from "#db/client.js";
import { scheduledJobs } from "#db/schema.js";

const TICK_INTERVAL_MS = 15_000;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 60_000;

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
        const attempts = Number(job.payload?._attempts ?? 0);

        if (attempts >= MAX_ATTEMPTS) {
          await db.delete(scheduledJobs).where(eq(scheduledJobs.id, job.id));
          logger?.error("Scheduled job gave up after max attempts", {
            jobId: job.id,
            type: job.type,
            guildId: job.guildId,
            attempts,
          });
          continue;
        }

        const handler = handlers.get(job.type);
        if (!handler) {
          await db.delete(scheduledJobs).where(eq(scheduledJobs.id, job.id));
          logger?.warn("No handler for scheduled job", { jobId: job.id, type: job.type });
          continue;
        }

        // Claim by pushing runAt into the future: a crash mid-handler leaves
        // the row behind for a retry instead of dropping the job, and a
        // successful run deletes it below. At-least-once, not exactly-once.
        await db
          .update(scheduledJobs)
          .set({
            runAt: new Date(Date.now() + RETRY_BASE_MS * (attempts + 1)),
            payload: { ...job.payload, _attempts: attempts + 1 },
          })
          .where(eq(scheduledJobs.id, job.id));

        try {
          await handler(job);
          await db.delete(scheduledJobs).where(eq(scheduledJobs.id, job.id));
        } catch (error) {
          logger?.error("Scheduled job failed, will retry", {
            jobId: job.id,
            type: job.type,
            guildId: job.guildId,
            attempt: attempts + 1,
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
