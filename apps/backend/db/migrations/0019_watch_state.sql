CREATE TABLE IF NOT EXISTS "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tmdb_id" text NOT NULL,
	"title" text NOT NULL,
	"poster_url" text,
	"year" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_user_kind_tmdb_unique" UNIQUE("user_id","kind","tmdb_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tmdb_id" text NOT NULL,
	"season" integer DEFAULT 0 NOT NULL,
	"episode" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"poster_url" text,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_progress_user_kind_tmdb_se_unique" UNIQUE("user_id","kind","tmdb_id","season","episode")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_user_added_idx" ON "watchlist_items" USING btree ("user_id","added_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watch_progress_user_updated_idx" ON "watch_progress" USING btree ("user_id","updated_at");
