import { and, desc, eq } from "drizzle-orm";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { getDb } from "#db/client.js";
import { giveaways } from "#db/schema.js";
import { createCard } from "#utils/respond.js";

export const ENTER_PREFIX = "giveaway:";

export async function createGiveaway({ guildId, channelId, prize, winnerCount, endsAt, createdBy }) {
  const db = getDb();
  const [row] = await db
    .insert(giveaways)
    .values({ guildId, channelId, prize, winnerCount, endsAt, createdBy })
    .returning();
  return row;
}

export async function getGiveaway(id) {
  const db = getDb();
  const [row] = await db.select().from(giveaways).where(eq(giveaways.id, id)).limit(1);
  return row ?? null;
}

export async function listGiveaways(guildId, { activeOnly = false, limit = 10 } = {}) {
  const db = getDb();
  const conditions = [eq(giveaways.guildId, guildId)];
  if (activeOnly) conditions.push(eq(giveaways.ended, 0));
  return db
    .select()
    .from(giveaways)
    .where(and(...conditions))
    .orderBy(desc(giveaways.id))
    .limit(limit);
}

export async function setGiveawayMessage(id, messageId) {
  const db = getDb();
  await db.update(giveaways).set({ messageId }).where(eq(giveaways.id, id));
}

export async function toggleEntrant(id, userId) {
  const db = getDb();
  const row = await getGiveaway(id);
  if (!row || row.ended) return null;

  const entrants = Array.isArray(row.entrants) ? row.entrants : [];
  const entered = entrants.includes(userId);
  const next = entered ? entrants.filter((entry) => entry !== userId) : [...entrants, userId];

  await db.update(giveaways).set({ entrants: next }).where(eq(giveaways.id, id));
  return { entered: !entered, count: next.length, row: { ...row, entrants: next } };
}

export async function markEnded(id) {
  const db = getDb();
  const [row] = await db.update(giveaways).set({ ended: 1 }).where(eq(giveaways.id, id)).returning();
  return row ?? null;
}

export function pickWinners(entrants, count) {
  const pool = [...new Set(entrants)];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(1, count));
}

export function buildGiveawayCard(row, { endedWinners = null } = {}) {
  const endsAtUnix = Math.floor(new Date(row.endsAt).getTime() / 1000);
  const entrants = Array.isArray(row.entrants) ? row.entrants : [];

  if (endedWinners) {
    return createCard({
      color: 0x99aab5,
      title: "🎉 Giveaway Ended",
      body: [
        `**${row.prize}**`,
        "",
        endedWinners.length > 0
          ? `- Winner(s): ${endedWinners.map((id) => `<@${id}>`).join(", ")}`
          : "- No valid entries — nobody won.",
        `- Entries: **${entrants.length}**`,
        `- Ended: <t:${endsAtUnix}:F>`,
      ].join("\n"),
      footer: `Giveaway #${row.id}`,
    });
  }

  return createCard({
    color: 0xeb459e,
    title: "🎉 Giveaway",
    body: [
      `**${row.prize}**`,
      "",
      `- Winners: **${row.winnerCount}**`,
      `- Entries: **${entrants.length}**`,
      `- Ends: <t:${endsAtUnix}:F> (<t:${endsAtUnix}:R>)`,
      "",
      "Press the button below to enter (press again to leave).",
    ].join("\n"),
    footer: `Giveaway #${row.id}`,
  });
}

export function buildEntryRow(id, { disabled = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ENTER_PREFIX}${id}`)
      .setEmoji("🎉")
      .setLabel("Enter")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

async function resolveGiveawayMessage(guild, row) {
  const channel = guild.channels.cache.get(row.channelId)
    ?? (await guild.channels.fetch(row.channelId).catch(() => null));
  if (!channel || !channel.isTextBased()) return { channel: null, message: null };
  const message = row.messageId
    ? await channel.messages.fetch(row.messageId).catch(() => null)
    : null;
  return { channel, message };
}

// Ends a giveaway: picks winners, updates the card, announces. Reused by the
// scheduler job, /giveaway end, and reroll (with rerollOnly).
export async function finishGiveaway({ guild, giveawayId, logger, reroll = false }) {
  const row = await getGiveaway(giveawayId);
  if (!row || row.guildId !== guild.id) return { ok: false, reason: "not_found" };
  if (!reroll && row.ended) return { ok: false, reason: "already_ended" };
  if (reroll && !row.ended) return { ok: false, reason: "not_ended" };

  const entrants = Array.isArray(row.entrants) ? row.entrants : [];
  const winners = entrants.length > 0 ? pickWinners(entrants, row.winnerCount) : [];

  if (!reroll) {
    await markEnded(giveawayId);
  }

  const { channel, message } = await resolveGiveawayMessage(guild, row);

  if (message) {
    await message
      .edit({
        components: [buildGiveawayCard(row, { endedWinners: winners }), buildEntryRow(row.id, { disabled: true })],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }

  if (channel && typeof channel.send === "function") {
    const text = winners.length > 0
      ? `🎉 ${reroll ? "Reroll!" : "Congratulations"} ${winners.map((id) => `<@${id}>`).join(", ")} — you won **${row.prize}**!`
      : `🎉 Giveaway **${row.prize}** ended with no entries.`;
    await channel
      .send({
        content: text,
        allowedMentions: { users: winners },
        ...(message ? { reply: { messageReference: message.id, failIfNotExists: false } } : {}),
      })
      .catch((error) => {
        logger?.warn("Failed to announce giveaway winners", {
          guildId: guild.id,
          giveawayId,
          message: error?.message || String(error),
        });
      });
  }

  return { ok: true, winners, row };
}
