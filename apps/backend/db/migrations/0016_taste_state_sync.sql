CREATE TABLE IF NOT EXISTS "taste_state" (
	"user_id" uuid NOT NULL,
	"profile_id" text DEFAULT 'default' NOT NULL,
	"kind" text NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taste_state_user_id_profile_id_kind_pk" PRIMARY KEY("user_id","profile_id","kind")
);--> statement-breakpoint
ALTER TABLE "taste_state" ADD CONSTRAINT "taste_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
