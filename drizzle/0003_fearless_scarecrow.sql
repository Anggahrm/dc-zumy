CREATE TABLE "starboard_entries" (
	"guild_id" text NOT NULL,
	"message_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"author_id" text,
	"starboard_message_id" text NOT NULL,
	"star_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "starboard_entries_guild_id_message_id_pk" PRIMARY KEY("guild_id","message_id")
);
