import { createHash } from "node:crypto";
import { DEFAULT_TENANT_ID } from "./schema/auth";
import { pool } from "./index";

type AuditHashInput = {
  sequenceId: number;
  previousHash: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  metadataText: string;
  createdAt: Date;
};

export function hashAuditEvent(input: AuditHashInput): string {
  return createHash("sha256")
    .update(
      [
        input.sequenceId,
        input.previousHash ?? "",
        input.action,
        input.entityType,
        input.entityId ?? "",
        input.actorId ?? "",
        input.metadataText,
        input.createdAt.toISOString(),
      ].join("|"),
    )
    .digest("hex");
}

export type AuditChainIntegrityResult = {
  valid: boolean;
  tenantId: string;
  eventCount: number;
  errors: string[];
};

export async function verifyAuditChainIntegrity(
  tenantId = DEFAULT_TENANT_ID,
): Promise<AuditChainIntegrityResult> {
  if (!pool) {
    throw new Error("DATABASE_URL must be set to verify the audit chain.");
  }

  const result = await pool.query<{
    sequence_id: string;
    previous_hash: string | null;
    event_hash: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    actor_id: string | null;
    metadata_text: string;
    created_at: Date;
  }>(
    `SELECT
       sequence_id,
       previous_hash,
       event_hash,
       action,
       entity_type,
       entity_id,
       actor_id,
       metadata::jsonb::text AS metadata_text,
       created_at
     FROM audit_events
     WHERE tenant_id = $1
     ORDER BY sequence_id ASC`,
    [tenantId],
  );

  const errors: string[] = [];
  let expectedSequenceId = 1;
  let previousHash: string | null = null;

  for (const row of result.rows) {
    const sequenceId = Number(row.sequence_id);
    if (sequenceId !== expectedSequenceId) {
      errors.push(
        `Expected sequence_id ${expectedSequenceId}, found ${sequenceId}.`,
      );
    }

    if (row.previous_hash !== previousHash) {
      errors.push(`Invalid previous_hash at sequence_id ${sequenceId}.`);
    }

    const expectedHash = hashAuditEvent({
      sequenceId,
      previousHash: row.previous_hash,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorId: row.actor_id,
      metadataText: row.metadata_text,
      createdAt: new Date(row.created_at),
    });
    if (row.event_hash !== expectedHash) {
      errors.push(`Invalid event_hash at sequence_id ${sequenceId}.`);
    }

    previousHash = row.event_hash;
    expectedSequenceId = sequenceId + 1;
  }

  return {
    valid: errors.length === 0,
    tenantId,
    eventCount: result.rowCount ?? 0,
    errors,
  };
}