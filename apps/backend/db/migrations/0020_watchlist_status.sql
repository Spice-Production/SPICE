ALTER TABLE "watchlist_items" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'watch_later' NOT NULL;
--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN IF NOT EXISTS "release_date" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_user_status_idx" ON "watchlist_items" USING btree ("user_id","status");
