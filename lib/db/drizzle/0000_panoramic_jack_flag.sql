CREATE TABLE "audit_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"actor_id" text,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"message_id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_data" (
	"module_name" text NOT NULL,
	"data_key" text NOT NULL,
	"data" jsonb NOT NULL,
	"source_file" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_data_module_name_data_key_pk" PRIMARY KEY("module_name","data_key")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"property_id" text PRIMARY KEY NOT NULL,
	"adres" text NOT NULL,
	"type" text NOT NULL,
	"bouwjaar" integer NOT NULL,
	"woonoppervlak" integer NOT NULL,
	"perceel" integer,
	"energielabel" text NOT NULL,
	"kenmerken" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_session_created_idx" ON "chat_messages" USING btree ("session_id","created_at","message_id");--> statement-breakpoint
CREATE INDEX "properties_adres_idx" ON "properties" USING btree ("adres");