import { bigint, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const usersData = pgTable("users_data", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guildsData = pgTable("guilds_data", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botData = pgTable("bot_data", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moderationCases = pgTable("moderation_cases", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  caseNumber: integer("case_number").notNull(),
  type: text("type").notNull(),
  targetId: text("target_id").notNull(),
  targetTag: text("target_tag"),
  moderatorId: text("moderator_id"),
  moderatorTag: text("moderator_tag"),
  reason: text("reason"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("moderation_cases_guild_case_idx").on(table.guildId, table.caseNumber),
  index("moderation_cases_guild_target_idx").on(table.guildId, table.targetId),
]);

export const memberLevels = pgTable("member_levels", {
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  xp: bigint("xp", { mode: "number" }).notNull().default(0),
  level: integer("level").notNull().default(1),
  messages: bigint("messages", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.guildId, table.userId] }),
  index("member_levels_guild_xp_idx").on(table.guildId, table.xp),
]);

export const starboardEntries = pgTable("starboard_entries", {
  guildId: text("guild_id").notNull(),
  messageId: text("message_id").notNull(),
  channelId: text("channel_id").notNull(),
  authorId: text("author_id"),
  starboardMessageId: text("starboard_message_id").notNull(),
  starCount: integer("star_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.guildId, table.messageId] }),
]);

export const giveaways = pgTable("giveaways", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id"),
  prize: text("prize").notNull(),
  winnerCount: integer("winner_count").notNull().default(1),
  entrants: jsonb("entrants").notNull().default([]),
  createdBy: text("created_by"),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  ended: integer("ended").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("giveaways_guild_idx").on(table.guildId),
]);

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  ticketNumber: integer("ticket_number").notNull(),
  channelId: text("channel_id").notNull(),
  userId: text("user_id").notNull(),
  claimedBy: text("claimed_by"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (table) => [
  index("tickets_guild_status_idx").on(table.guildId, table.status),
  index("tickets_channel_idx").on(table.channelId),
  uniqueIndex("tickets_guild_number_idx").on(table.guildId, table.ticketNumber),
]);

export const scheduledJobs = pgTable("scheduled_jobs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id"),
  type: text("type").notNull(),
  dedupeKey: text("dedupe_key"),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("scheduled_jobs_run_at_idx").on(table.runAt),
  index("scheduled_jobs_dedupe_key_idx").on(table.dedupeKey),
]);
