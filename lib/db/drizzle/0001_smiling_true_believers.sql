CREATE TABLE "core_runtime_state" (
	"state_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"reason" text,
	"last_integrity_check_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_runtime_state_mode_check" CHECK ("core_runtime_state"."mode" in ('NORMAL', 'READ_ONLY', 'RECOVERY'))
);
--> statement-breakpoint
CREATE TABLE "integrity_checks" (
	"check_id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"status" text NOT NULL,
	"expected_checksum" text,
	"actual_checksum" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrity_checks_status_check" CHECK ("integrity_checks"."status" in ('PASSED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "recovery_points" (
	"recovery_point_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"label" text,
	"checksum" text,
	"source" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "recovery_points_kind_check" CHECK ("recovery_points"."kind" in ('BACKUP', 'ROLLBACK')),
	CONSTRAINT "recovery_points_status_check" CHECK ("recovery_points"."status" in ('CREATED', 'VERIFIED', 'FAILED', 'RESTORED'))
);
--> statement-breakpoint
CREATE TABLE "trust_metadata" (
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_class" text NOT NULL,
	"source_boundary" text NOT NULL,
	"source_reference" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_metadata_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id"),
	CONSTRAINT "trust_metadata_source_class_check" CHECK ("trust_metadata"."source_class" in ('CANONICAL', 'SHADOW', 'PAPER', 'LIVE'))
);
--> statement-breakpoint
CREATE INDEX "integrity_checks_scope_idx" ON "integrity_checks" USING btree ("scope","checked_at");--> statement-breakpoint
CREATE INDEX "recovery_points_status_idx" ON "recovery_points" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "trust_metadata_boundary_idx" ON "trust_metadata" USING btree ("source_boundary");