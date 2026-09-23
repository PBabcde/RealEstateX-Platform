ALTER TABLE "properties" ADD COLUMN "owner_id" text;
--> statement-breakpoint
UPDATE "properties" SET "owner_id" = 'legacy' WHERE "owner_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "owner_id" SET NOT NULL;