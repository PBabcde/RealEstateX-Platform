ALTER TABLE "module_data"
  ADD COLUMN IF NOT EXISTS "tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001';
--> statement-breakpoint
UPDATE "module_data"
SET "tenant_id" = '00000000-0000-0000-0000-000000000001'
WHERE "tenant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "module_data"
  ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "module_data"
  DROP CONSTRAINT IF EXISTS "module_data_module_name_data_key_pk";
--> statement-breakpoint
ALTER TABLE "module_data"
  ADD CONSTRAINT "module_data_tenant_id_module_name_data_key_pk"
  PRIMARY KEY ("tenant_id", "module_name", "data_key");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'module_data_tenant_id_tenants_id_fk'
      AND conrelid = 'module_data'::regclass
  ) THEN
    ALTER TABLE "module_data"
      ADD CONSTRAINT "module_data_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
  END IF;
END;
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "module_data_tenant_updated_idx"
  ON "module_data" ("tenant_id", "updated_at");