ALTER TABLE "audit_events"
  ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "trust_metadata"
  ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "recovery_points"
  ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "integrity_checks"
  ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
UPDATE "audit_events"
SET "tenant_id" = '00000000-0000-0000-0000-000000000001'
WHERE "tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "trust_metadata"
SET "tenant_id" = '00000000-0000-0000-0000-000000000001'
WHERE "tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "recovery_points"
SET "tenant_id" = '00000000-0000-0000-0000-000000000001'
WHERE "tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "integrity_checks"
SET "tenant_id" = '00000000-0000-0000-0000-000000000001'
WHERE "tenant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "audit_events"
  ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001',
  ALTER COLUMN "tenant_id" SET NOT NULL,
  ALTER COLUMN "sequence_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "trust_metadata"
  ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001',
  ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "recovery_points"
  ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001',
  ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "integrity_checks"
  ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001',
  ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_events"
  DROP CONSTRAINT IF EXISTS "audit_events_sequence_id_unique";
--> statement-breakpoint
ALTER TABLE "trust_metadata"
  DROP CONSTRAINT IF EXISTS "trust_metadata_entity_type_entity_id_pk";
--> statement-breakpoint
ALTER TABLE "trust_metadata"
  ADD CONSTRAINT "trust_metadata_pkey"
  PRIMARY KEY ("tenant_id", "entity_type", "entity_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_events_tenant_sequence_unique'
      AND conrelid = 'audit_events'::regclass
  ) THEN
    ALTER TABLE "audit_events"
      ADD CONSTRAINT "audit_events_tenant_sequence_unique"
      UNIQUE ("tenant_id", "sequence_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_events_tenant_id_tenants_id_fk'
      AND conrelid = 'audit_events'::regclass
  ) THEN
    ALTER TABLE "audit_events"
      ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trust_metadata_tenant_id_tenants_id_fk'
      AND conrelid = 'trust_metadata'::regclass
  ) THEN
    ALTER TABLE "trust_metadata"
      ADD CONSTRAINT "trust_metadata_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recovery_points_tenant_id_tenants_id_fk'
      AND conrelid = 'recovery_points'::regclass
  ) THEN
    ALTER TABLE "recovery_points"
      ADD CONSTRAINT "recovery_points_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'integrity_checks_tenant_id_tenants_id_fk'
      AND conrelid = 'integrity_checks'::regclass
  ) THEN
    ALTER TABLE "integrity_checks"
      ADD CONSTRAINT "integrity_checks_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
  END IF;
END;
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_tenant_created_idx"
  ON "audit_events" ("tenant_id", "created_at", "event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trust_metadata_tenant_boundary_idx"
  ON "trust_metadata" ("tenant_id", "source_boundary");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recovery_points_tenant_status_idx"
  ON "recovery_points" ("tenant_id", "status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrity_checks_tenant_scope_idx"
  ON "integrity_checks" ("tenant_id", "scope", "checked_at");