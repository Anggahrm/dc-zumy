CREATE TABLE "giveaways" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"prize" text NOT NULL,
	"winner_count" integer DEFAULT 1 NOT NULL,
	"entrants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"ends_at" timestamp with time zone NOT NULL,
	"ended" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "giveaways_guild_idx" ON "giveaways" USING btree ("guild_id");