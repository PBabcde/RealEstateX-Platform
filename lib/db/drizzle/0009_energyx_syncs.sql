CREATE TABLE IF NOT EXISTS "energyx_syncs" (
	"property_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "energyx_syncs_property_idx" ON "energyx_syncs" USING btree ("property_id");
