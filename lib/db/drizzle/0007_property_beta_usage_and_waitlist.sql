CREATE TABLE "property_analysis_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reserved_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_analysis_usage_status_check" CHECK ("status" in ('reserved', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "property_analysis_usage" ADD CONSTRAINT "property_analysis_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "property_analysis_usage" ADD CONSTRAINT "property_analysis_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "property_analysis_usage_scope_idx" ON "property_analysis_usage" USING btree ("tenant_id", "user_id", "status", "reserved_until");
--> statement-breakpoint
CREATE INDEX "property_analysis_usage_reservation_expiry_idx" ON "property_analysis_usage" USING btree ("status", "reserved_until");
--> statement-breakpoint
CREATE TABLE "property_beta_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"email" varchar(254) NOT NULL,
	"consent" boolean NOT NULL,
	"consent_version" varchar(80) NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_beta_waitlist_consent_check" CHECK ("consent" = true)
);
--> statement-breakpoint
ALTER TABLE "property_beta_waitlist" ADD CONSTRAINT "property_beta_waitlist_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "property_beta_waitlist" ADD CONSTRAINT "property_beta_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "property_beta_waitlist_tenant_user_unique" ON "property_beta_waitlist" USING btree ("tenant_id", "user_id");
