import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "#db/client.js";
import { tickets } from "#db/schema.js";
import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";

const TICKETS_DEFAULTS = {
  categoryId: null,
  supportRoleId: null,
};

function normalizeTickets(config) {
  if (typeof config.categoryId !== "string") config.categoryId = null;
  config.supportRoleId = typeof config.supportRoleId === "string" ? config.supportRoleId : null;
  // Older shapes stored channel ids through the sanitizer; keep behavior.
  config.categoryId = guildFeatureUtils.sanitizeChannelId(config.categoryId);
}

export async function getTicketsConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "tickets", TICKETS_DEFAULTS, normalizeTickets, options);
  return {
    categoryId: config.categoryId,
    supportRoleId: config.supportRoleId,
  };
}

export async function updateTicketsConfig(guildId, mutate) {
  const config = await loadGuildFeature(guildId, "tickets", TICKETS_DEFAULTS, normalizeTickets);
  const result = mutate(config);
  normalizeTickets(config);
  return result;
}

// Allocates the per-guild ticket number inside the INSERT (like cases.js) so
// numbers survive crashes and never repeat — the debounced JSONB counter
// used previously could.
export async function createTicketRow({ guildId, channelId, userId }) {
  const db = getDb();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const [row] = await db
        .insert(tickets)
        .values({
          guildId,
          ticketNumber: sql`(select coalesce(max(${tickets.ticketNumber}), 0) + 1 from ${tickets} where ${tickets.guildId} = ${guildId})`,
          channelId,
          userId,
        })
        .returning();
      return row;
    } catch (error) {
      const code = error?.code ?? error?.cause?.code;
      if (code === "23505" && attempt < 3) continue;
      throw error;
    }
  }

  throw new Error("Failed to allocate a ticket number.");
}

export async function getTicketByChannel(channelId) {
  const db = getDb();
  const [row] = await db.select().from(tickets).where(eq(tickets.channelId, channelId)).limit(1);
  return row ?? null;
}

export async function getTicketById(id) {
  const db = getDb();
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return row ?? null;
}

export async function getOpenTicketForUser(guildId, userId) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.guildId, guildId), eq(tickets.userId, userId), eq(tickets.status, "open")))
    .limit(1);
  return row ?? null;
}

export async function listOpenTickets(guildId, limit = 25) {
  const db = getDb();
  return db
    .select()
    .from(tickets)
    .where(and(eq(tickets.guildId, guildId), eq(tickets.status, "open")))
    .orderBy(desc(tickets.id))
    .limit(limit);
}

export async function countOpenTickets(guildId) {
  const db = getDb();
  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(and(eq(tickets.guildId, guildId), eq(tickets.status, "open")));
  return count;
}

export async function claimTicket(id, staffId) {
  const db = getDb();
  const [row] = await db
    .update(tickets)
    .set({ claimedBy: staffId })
    .where(and(eq(tickets.id, id), eq(tickets.status, "open")))
    .returning();
  return row ?? null;
}

export async function closeTicketRow(id) {
  const db = getDb();
  const [row] = await db
    .update(tickets)
    .set({ status: "closed", closedAt: new Date() })
    .where(and(eq(tickets.id, id), eq(tickets.status, "open")))
    .returning();
  return row ?? null;
}

// Builds a plain-text transcript of a ticket channel (newest 100 messages,
// chronological order).
export async function buildTranscript(channel) {
  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!fetched) return "Couldn't load the transcript.";

  const lines = [...fetched.values()]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => {
      const time = new Date(message.createdTimestamp).toISOString().replace("T", " ").slice(0, 19);
      const author = message.author?.tag ?? "unknown";
      const content = message.content || "(no text)";
      const attachments = message.attachments?.size > 0
        ? ` [${message.attachments.size} attachment(s)]`
        : "";
      return `[${time}] ${author}: ${content}${attachments}`;
    });

  return lines.join("\n") || "No messages.";
}
