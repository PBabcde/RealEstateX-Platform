CREATE TABLE "energyx_renovation_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "project_id" varchar(100) NOT NULL,
  "title" varchar(120) NOT NULL,
  "energy_label" varchar(20),
  "wws_score" double precision,
  "max_rent_eur" double precision,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "energyx_renovation_scenarios_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "energyx_renovation_scenarios_scope_idx"
  ON "energyx_renovation_scenarios" USING btree
  ("tenant_id", "user_id", "project_id", "expires_at");
