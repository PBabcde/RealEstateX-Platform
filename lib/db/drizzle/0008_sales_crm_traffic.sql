CREATE TABLE IF NOT EXISTS "leads" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
"name" varchar(200) NOT NULL,
"email" varchar(254) NOT NULL,
"phone" varchar(40),
"company" varchar(200),
"status" text DEFAULT 'new' NOT NULL,
"lead_score" integer DEFAULT 0 NOT NULL,
"consent" boolean NOT NULL,
"consent_version" varchar(80) NOT NULL,
"consented_at" timestamp with time zone NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "leads_status_check" CHECK ("status" in ('new', 'contacted', 'qualified', 'won', 'lost')),
CONSTRAINT "leads_score_check" CHECK ("lead_score" between 0 and 100),
CONSTRAINT "leads_consent_check" CHECK ("consent" = true),
CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "traffic_events" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
"session_id" varchar(64) NOT NULL,
"page_url" varchar(300) NOT NULL,
"referrer" varchar(300),
"user_agent" varchar(300),
"ip_hash" varchar(64),
"event_type" varchar(40) NOT NULL,
"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "traffic_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_interactions" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
"lead_id" uuid NOT NULL,
"action_type" varchar(40) NOT NULL,
"notes" text,
"ai_generated_summary" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "crm_interactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
CONSTRAINT "crm_interactions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_tenant_status_idx" ON "leads" ("tenant_id","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_tenant_email_idx" ON "leads" ("tenant_id","email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_events_tenant_time_idx" ON "traffic_events" ("tenant_id","timestamp");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_events_tenant_session_idx" ON "traffic_events" ("tenant_id","session_id","timestamp");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_interactions_lead_idx" ON "crm_interactions" ("tenant_id","lead_id","created_at");
