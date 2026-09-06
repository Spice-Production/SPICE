-- Self-host rescue (fresh databases only): the listen-together tables and
-- profiles.username reached the hosted database via `db:push` without a
-- recorded migration, and 0014 is the first migration that touches them.
-- They are created here, ahead of the dedup statements below.
-- Already-migrated databases recorded 0014 as applied and never re-run it
-- (the runtime migrator keys on journal timestamps, not statement hashes),
-- so this block is a no-op for them.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listen_together_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_user_id" uuid NOT NULL,
	"host_profile_id" text DEFAULT 'default' NOT NULL,
	"current_track_json" text,
	"queue_json" text DEFAULT '[]' NOT NULL,
	"queue_index" integer DEFAULT 0 NOT NULL,
	"is_playing" boolean DEFAULT false NOT NULL,
	"progress_ms" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listen_together_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"invited_user_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "listen_together_sessions" ADD CONSTRAINT "listen_together_sessions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listen_together_invites" ADD CONSTRAINT "listen_together_invites_session_id_listen_together_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."listen_together_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listen_together_invites" ADD CONSTRAINT "listen_together_invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listen_together_invites" ADD CONSTRAINT "listen_together_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_unique" UNIQUE("username");--> statement-breakpoint
WITH "ranked_sessions" AS (
	SELECT "id", ROW_NUMBER() OVER (
		PARTITION BY "host_user_id"
		ORDER BY "updated_at" DESC, "id" DESC
	) AS "duplicate_rank"
	FROM "listen_together_sessions"
)
DELETE FROM "listen_together_sessions"
WHERE "id" IN (
	SELECT "id" FROM "ranked_sessions" WHERE "duplicate_rank" > 1
);--> statement-breakpoint
WITH "ranked_invites" AS (
	SELECT "id", ROW_NUMBER() OVER (
		PARTITION BY "session_id", "invited_user_id"
		ORDER BY "created_at" DESC, "id" DESC
	) AS "duplicate_rank"
	FROM "listen_together_invites"
)
DELETE FROM "listen_together_invites"
WHERE "id" IN (
	SELECT "id" FROM "ranked_invites" WHERE "duplicate_rank" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "listen_together_invites_session_user_unique" ON "listen_together_invites" USING btree ("session_id","invited_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listen_together_sessions_host_user_unique" ON "listen_together_sessions" USING btree ("host_user_id");
