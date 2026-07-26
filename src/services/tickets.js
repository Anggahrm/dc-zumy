import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "#db/client.js";
import { tickets } from "#db/schema.js";
import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";

const TICKETS_DEFAULTS = {
  categoryId: null,
  supportRoleId: null,
  counter: 0,
};

function normalizeTickets(config) {
  if (typeof config.categoryId !== "string") config.categoryId = null;
  config.supportRoleId = typeof config.supportRoleId === "string" ? config.supportRoleId : null;
  if (!Number.isInteger(config.counter) || config.counter < 0) config.counter = 0;
  // Older shapes stored channel ids through the sanitizer; keep behavior.
  config.categoryId = guildFeatureUtils.sanitizeChannelId(config.categoryId);
}

export async function getTicketsConfig(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "tickets", TICKETS_DEFAULTS, normalizeTickets, options);
  return {
    categoryId: config.categoryId,
    supportRoleId: config.supportRoleId,
    counter: config.counter,
  };
}

export async function updateTicketsConfig(guildId, mutate) {
  const config = await loadGuildFeature(guildId, "tickets", TICKETS_DEFAULTS, normalizeTickets);
  const result = mutate(config);
  normalizeTickets(config);
  return result;
}

export async function nextTicketNumber(guildId) {
  return updateTicketsConfig(guildId, (config) => {
    config.counter += 1;
    return config.counter;
  });
}

export async function createTicketRow({ guildId, ticketNumber, channelId, userId }) {
  const db = getDb();
  const [row] = await db
    .insert(tickets)
    .values({ guildId, ticketNumber, channelId, userId })
    .returning();
  return row;
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
  if (!fetched) return "Transcript unavailable.";

  const lines = [...fetched.values()]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => {
      const time = new Date(message.createdTimestamp).toISOString().replace("T", " ").slice(0, 19);
      const author = message.author?.tag ?? "unknown";
      const content = message.content || "(no text content)";
      const attachments = message.attachments?.size > 0
        ? ` [${message.attachments.size} attachment(s)]`
        : "";
      return `[${time}] ${author}: ${content}${attachments}`;
    });

  return lines.join("\n") || "No messages.";
}
