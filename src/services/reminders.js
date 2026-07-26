import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "#db/client.js";
import { scheduledJobs } from "#db/schema.js";

export const MAX_REMINDERS_PER_USER = 10;
export const MAX_REMINDER_LENGTH = 500;

export async function listReminders(userId) {
  const db = getDb();
  return db
    .select()
    .from(scheduledJobs)
    .where(and(eq(scheduledJobs.type, "reminder"), sql`${scheduledJobs.payload}->>'userId' = ${userId}`))
    .orderBy(asc(scheduledJobs.runAt))
    .limit(MAX_REMINDERS_PER_USER + 5);
}

export async function cancelReminder(userId, jobId) {
  const db = getDb();
  const rows = await db
    .delete(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.id, jobId),
        eq(scheduledJobs.type, "reminder"),
        sql`${scheduledJobs.payload}->>'userId' = ${userId}`,
      ),
    )
    .returning();
  return rows.length > 0;
}
