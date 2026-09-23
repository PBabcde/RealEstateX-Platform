ALTER TABLE "core_runtime_state"
  ADD COLUMN IF NOT EXISTS "tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001';
--> statement-breakpoint
UPDATE "core_runtime_state"
SET "tenant_id" = '00000000-0000-0000-0000-000000000001'
WHERE "tenant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "core_runtime_state"
  ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "core_runtime_state"
  DROP CONSTRAINT IF EXISTS "core_runtime_state_pkey";
--> statement-breakpoint
ALTER TABLE "core_runtime_state"
  ADD CONSTRAINT "core_runtime_state_tenant_id_state_id_pk"
  PRIMARY KEY ("tenant_id", "state_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'core_runtime_state_tenant_id_tenants_id_fk'
      AND conrelid = 'core_runtime_state'::regclass
  ) THEN
    ALTER TABLE "core_runtime_state"
      ADD CONSTRAINT "core_runtime_state_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
  END IF;
END;
$$;