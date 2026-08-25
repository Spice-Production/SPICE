ALTER TABLE "users" ADD COLUMN "moderation_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "moderation_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "moderation_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "moderation_set_by" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "moderation_set_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users"
SET "moderation_status" = 'banned',
    "moderation_set_at" = "created_at",
    "account_role" = 'user'
WHERE "account_role" = 'banned';
