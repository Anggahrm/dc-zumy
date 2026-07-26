import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
