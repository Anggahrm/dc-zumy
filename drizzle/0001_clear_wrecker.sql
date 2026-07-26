CREATE TABLE "moderation_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"case_number" integer NOT NULL,
	"type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_tag" text,
	"moderator_id" text,
	"moderator_tag" text,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text,
	"type" text NOT NULL,
	"dedupe_key" text,
	"run_at" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_cases_guild_case_idx" ON "moderation_cases" USING btree ("guild_id","case_number");--> statement-breakpoint
CREATE INDEX "moderation_cases_guild_target_idx" ON "moderation_cases" USING btree ("guild_id","target_id");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_run_at_idx" ON "scheduled_jobs" USING btree ("run_at");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_dedupe_key_idx" ON "scheduled_jobs" USING btree ("dedupe_key");