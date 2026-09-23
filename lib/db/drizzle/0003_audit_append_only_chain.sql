CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS audit_events_sequence_id_seq;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "sequence_id" bigint;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "previous_hash" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "event_hash" text;
--> statement-breakpoint
WITH RECURSIVE ordered AS (
  SELECT
    "event_id",
    row_number() OVER (ORDER BY "created_at", "event_id")::bigint AS "sequence_id"
  FROM "audit_events"
),
chain AS (
  SELECT
    ordered."event_id",
    ordered."sequence_id",
    NULL::text AS "previous_hash",
    encode(
      digest(
        concat_ws(
          '|',
          ordered."sequence_id"::text,
          '',
          audit."action",
          audit."entity_type",
          coalesce(audit."entity_id", ''),
          coalesce(audit."actor_id", ''),
          audit."metadata"::text,
          to_char(
            audit."created_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ),
        'sha256'
      ),
      'hex'
    ) AS "event_hash"
  FROM ordered
  JOIN "audit_events" audit ON audit."event_id" = ordered."event_id"
  WHERE ordered."sequence_id" = 1

  UNION ALL

  SELECT
    ordered."event_id",
    ordered."sequence_id",
    chain."event_hash" AS "previous_hash",
    encode(
      digest(
        concat_ws(
          '|',
          ordered."sequence_id"::text,
          chain."event_hash",
          audit."action",
          audit."entity_type",
          coalesce(audit."entity_id", ''),
          coalesce(audit."actor_id", ''),
          audit."metadata"::text,
          to_char(
            audit."created_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ),
        'sha256'
      ),
      'hex'
    ) AS "event_hash"
  FROM chain
  JOIN ordered
    ON ordered."sequence_id" = chain."sequence_id" + 1
  JOIN "audit_events" audit ON audit."event_id" = ordered."event_id"
)
UPDATE "audit_events" audit
SET
  "sequence_id" = chain."sequence_id",
  "previous_hash" = chain."previous_hash",
  "event_hash" = chain."event_hash"
FROM chain
WHERE audit."event_id" = chain."event_id";
--> statement-breakpoint
ALTER TABLE "audit_events"
  ALTER COLUMN "sequence_id" SET DEFAULT nextval('audit_events_sequence_id_seq'),
  ALTER COLUMN "sequence_id" SET NOT NULL,
  ALTER COLUMN "event_hash" SET NOT NULL;
--> statement-breakpoint
ALTER SEQUENCE audit_events_sequence_id_seq
  OWNED BY audit_events.sequence_id;
--> statement-breakpoint
SELECT setval(
  'audit_events_sequence_id_seq',
  COALESCE((SELECT max("sequence_id") FROM "audit_events"), 0) + 1,
  false
);
--> statement-breakpoint
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_sequence_id_unique" UNIQUE ("sequence_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'restrict_violation',
    MESSAGE = 'UPDATE/DELETE operatie geweigerd: audit_events tabel is strikt append-only.';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_enforce_audit_events_immutability ON "audit_events";
--> statement-breakpoint
CREATE TRIGGER trg_enforce_audit_events_immutability
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_events_mutation();