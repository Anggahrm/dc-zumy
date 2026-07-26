import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "#db/client.js";
import { moderationCases } from "#db/schema.js";
import { sendGuildLog } from "#services/logging.js";

export const CASE_TYPE_META = {
  warn: { label: "Warn", color: 0xf1c40f },
  unwarn: { label: "Warning removed", color: 0x57f287 },
  kick: { label: "Kick", color: 0xe67e22 },
  ban: { label: "Ban", color: 0xed4245 },
  tempban: { label: "Tempban", color: 0xed4245 },
  unban: { label: "Unban", color: 0x57f287 },
  timeout: { label: "Timeout", color: 0xf1c40f },
  untimeout: { label: "Timeout removed", color: 0x57f287 },
  mute: { label: "Mute", color: 0xf1c40f },
  unmute: { label: "Unmute", color: 0x57f287 },
  quarantine: { label: "Quarantine", color: 0xed4245 },
  unquarantine: { label: "Quarantine removed", color: 0x57f287 },
  "auto-timeout": { label: "Auto timeout (escalation)", color: 0xe67e22 },
  "auto-kick": { label: "Auto kick (escalation)", color: 0xe67e22 },
  "auto-ban": { label: "Auto ban (escalation)", color: 0xed4245 },
};

const MAX_CREATE_RETRIES = 3;

export async function createCase({
  guildId,
  type,
  targetId,
  targetTag = null,
  moderatorId = null,
  moderatorTag = null,
  reason = null,
  metadata = {},
}) {
  const db = getDb();

  for (let attempt = 1; attempt <= MAX_CREATE_RETRIES; attempt += 1) {
    try {
      const [row] = await db
        .insert(moderationCases)
        .values({
          guildId,
          caseNumber: sql`(select coalesce(max(${moderationCases.caseNumber}), 0) + 1 from ${moderationCases} where ${moderationCases.guildId} = ${guildId})`,
          type,
          targetId,
          targetTag,
          moderatorId,
          moderatorTag,
          reason,
          metadata,
        })
        .returning();
      return row;
    } catch (error) {
      // 23505 = unique_violation on (guild_id, case_number): two cases raced
      // for the same number — retry with a fresh max().
      if (error?.code === "23505" && attempt < MAX_CREATE_RETRIES) continue;
      throw error;
    }
  }

  throw new Error("Failed to allocate a case number.");
}

export async function getCase(guildId, caseNumber) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(moderationCases)
    .where(and(eq(moderationCases.guildId, guildId), eq(moderationCases.caseNumber, caseNumber)))
    .limit(1);
  return row ?? null;
}

export async function listCases(guildId, { targetId = null, limit = 10 } = {}) {
  const db = getDb();
  const conditions = [eq(moderationCases.guildId, guildId)];
  if (targetId) {
    conditions.push(eq(moderationCases.targetId, targetId));
  }

  return db
    .select()
    .from(moderationCases)
    .where(and(...conditions))
    .orderBy(desc(moderationCases.caseNumber))
    .limit(limit);
}

export async function updateCaseReason(guildId, caseNumber, reason) {
  const db = getDb();
  const [row] = await db
    .update(moderationCases)
    .set({ reason })
    .where(and(eq(moderationCases.guildId, guildId), eq(moderationCases.caseNumber, caseNumber)))
    .returning();
  return row ?? null;
}

// Creates a case and posts it to the modlog channel (when the `cases` log
// event is enabled). Never throws — moderation actions must not fail because
// bookkeeping did.
export async function recordCase({
  guild,
  type,
  target,
  moderator = null,
  reason = null,
  metadata = {},
  logger,
}) {
  let row = null;
  try {
    row = await createCase({
      guildId: guild.id,
      type,
      targetId: target.id,
      targetTag: target.tag ?? null,
      moderatorId: moderator?.id ?? null,
      moderatorTag: moderator?.tag ?? null,
      reason,
      metadata,
    });
  } catch (error) {
    logger?.warn("Failed to create moderation case", {
      guildId: guild.id,
      type,
      targetId: target.id,
      message: error?.message || String(error),
    });
    return null;
  }

  const meta = CASE_TYPE_META[type] ?? { label: type, color: 0x3498db };
  const lines = [
    `- Action: **${meta.label}**`,
    `- Target: **${target.tag ?? target.id}** (\`${target.id}\`)`,
    `- Moderator: ${moderator ? `**${moderator.tag ?? moderator.id}**` : "Unknown"}`,
    `- Reason: ${reason || "No reason provided."}`,
  ];
  if (metadata.duration) {
    lines.splice(3, 0, `- Duration: ${metadata.duration}`);
  }

  await sendGuildLog({
    guild,
    eventKey: "cases",
    title: `Case #${row.caseNumber}`,
    color: meta.color,
    lines,
    actorId: target.id,
    logger,
  });

  return row;
}
