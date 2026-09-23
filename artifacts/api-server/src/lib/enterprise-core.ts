import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, hashAuditEvent } from "@workspace/db";
import {
  auditEventsTable,
  coreRuntimeStateTable,
  integrityChecksTable,
  recoveryPointsTable,
  trustMetadataTable,
} from "@workspace/db/schema";

export const TRUST_SOURCE_CLASSES = [
  "CANONICAL",
  "SHADOW",
  "PAPER",
  "LIVE",
] as const;

export type TrustSourceClass = (typeof TRUST_SOURCE_CLASSES)[number];

export type TrustMetadataInput = {
  tenantId: string;
  entityType: string;
  entityId: string;
  sourceClass: TrustSourceClass;
  sourceBoundary: string;
  sourceReference?: string;
  metadata?: Record<string, unknown>;
  content?: unknown;
};

export type AuditEventInput = {
  tenantId: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
};

type AuditDatabase = Pick<NonNullable<typeof db>, "execute" | "insert" | "select">;

export type AuditEventFilter = {
  tenantId: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
};

export type RecoveryMode = "NORMAL" | "READ_ONLY" | "RECOVERY";

export type IntegrityResult = {
  checkId: string;
  scope: string;
  status: "PASSED" | "FAILED";
  expectedChecksum?: string;
  actualChecksum: string;
  checkedAt: string;
};

const DEFAULT_STATE_ID = "global";
let runtimeMode: RecoveryMode = "NORMAL";
let runtimeReason: string | undefined;

function requireDatabase() {
  if (!db) {
    throw new Error(
      "PostgreSQL is required for Enterprise Core trust, audit, and recovery services.",
    );
  }
  return db;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function hashIntegrityValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export async function appendAuditEvent(
  database: AuditDatabase,
  input: AuditEventInput & { eventId?: string; createdAt?: Date },
) {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtext('realestatex.audit_events'))`,
  );
  const sequenceResult = await database.execute(
    sql`select nextval('audit_events_sequence_id_seq') as sequence_id`,
  );
  const [sequenceRow] = sequenceResult.rows as unknown as Array<{
    sequence_id: string | number;
  }>;
  const sequenceId = Number(sequenceRow?.sequence_id);
  if (!Number.isSafeInteger(sequenceId) || sequenceId < 1) {
    throw new Error("Could not allocate an audit event sequence.");
  }
  const [previous] = await database
    .select({
      sequenceId: auditEventsTable.sequenceId,
      eventHash: auditEventsTable.eventHash,
    })
    .from(auditEventsTable)
    .where(eq(auditEventsTable.tenantId, input.tenantId))
    .orderBy(desc(auditEventsTable.sequenceId))
    .limit(1);

  const previousHash = previous?.eventHash ?? null;
  const createdAt = input.createdAt ?? new Date();
  const metadata = input.metadata ?? {};
  const metadataResult = await database.execute(
    sql`select ${JSON.stringify(metadata)}::jsonb::text as metadata_text`,
  );
  const [metadataRow] = metadataResult.rows as unknown as Array<{
    metadata_text: string;
  }>;
  if (!metadataRow?.metadata_text) {
    throw new Error("Could not canonicalize audit event metadata.");
  }
  const event = {
    eventId: input.eventId ?? randomUUID(),
    tenantId: input.tenantId,
    sequenceId,
    previousHash,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: input.actorId,
    metadata,
    createdAt,
    eventHash: hashAuditEvent({
      sequenceId,
      previousHash,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      actorId: input.actorId ?? null,
      metadataText: metadataRow.metadata_text,
      createdAt,
    }),
  };

  await database.insert(auditEventsTable).values(event);
  return event;
}

export function assertTrustSourceClass(value: string): asserts value is TrustSourceClass {
  if (!TRUST_SOURCE_CLASSES.includes(value as TrustSourceClass)) {
    throw new Error(`Unsupported trust source class: ${value}`);
  }
}

export function assertSameTrustBoundary(
  values: Array<Pick<TrustMetadataInput, "sourceBoundary">>,
): void {
  const boundaries = new Set(values.map((value) => value.sourceBoundary));
  if (boundaries.size > 1) {
    throw new Error(
      "Cross-source contamination blocked: all inputs must share one source boundary.",
    );
  }
}

export async function registerTrustMetadata(
  input: TrustMetadataInput,
): Promise<void> {
  assertTrustSourceClass(input.sourceClass);
  if (!input.entityType.trim() || !input.entityId.trim()) {
    throw new Error("Trust metadata requires an entity type and immutable entity ID.");
  }
  if (!input.sourceBoundary.trim()) {
    throw new Error("Trust metadata requires a source boundary.");
  }

  const database = requireDatabase();
  await database
    .insert(trustMetadataTable)
    .values({
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      sourceClass: input.sourceClass,
      sourceBoundary: input.sourceBoundary,
      sourceReference: input.sourceReference,
      metadata: input.metadata ?? {},
      contentHash:
        input.content === undefined ? undefined : hashIntegrityValue(input.content),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        trustMetadataTable.tenantId,
        trustMetadataTable.entityType,
        trustMetadataTable.entityId,
      ],
      set: {
        sourceClass: input.sourceClass,
        sourceBoundary: input.sourceBoundary,
        sourceReference: input.sourceReference,
        metadata: input.metadata ?? {},
        contentHash:
          input.content === undefined ? undefined : hashIntegrityValue(input.content),
        updatedAt: new Date(),
      },
    });
}

export async function getTrustMetadata(
  tenantId: string,
  entityType: string,
  entityId: string,
) {
  const [metadata] = await requireDatabase()
    .select()
    .from(trustMetadataTable)
    .where(
      and(
        eq(trustMetadataTable.tenantId, tenantId),
        eq(trustMetadataTable.entityType, entityType),
        eq(trustMetadataTable.entityId, entityId),
      ),
    )
    .limit(1);
  return metadata;
}

export async function recordAuditEvent(input: AuditEventInput) {
  return requireDatabase().transaction((transaction) =>
    appendAuditEvent(transaction, input),
  );
}

export async function queryAuditEvents(filter: AuditEventFilter) {
  const conditions = [eq(auditEventsTable.tenantId, filter.tenantId)];
  if (filter.actorId) {
    conditions.push(eq(auditEventsTable.actorId, filter.actorId));
  }
  if (filter.entityType) {
    conditions.push(eq(auditEventsTable.entityType, filter.entityType));
  }
  if (filter.entityId) {
    conditions.push(eq(auditEventsTable.entityId, filter.entityId));
  }
  if (filter.from) {
    conditions.push(gte(auditEventsTable.createdAt, filter.from));
  }
  if (filter.to) {
    conditions.push(lte(auditEventsTable.createdAt, filter.to));
  }

  return requireDatabase()
    .select()
    .from(auditEventsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditEventsTable.createdAt), asc(auditEventsTable.eventId));
}

export function formatAuditEvent(event: {
  eventId: string;
  tenantId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}) {
  return {
    eventId: event.eventId,
    tenantId: event.tenantId,
    timestamp: event.createdAt.toISOString(),
    actor: event.actorId ?? "system",
    action: event.action,
    entity: event.entityId
      ? `${event.entityType}/${event.entityId}`
      : event.entityType,
    details: event.metadata,
  };
}

export type AuditChainValidation = {
  valid: boolean;
  eventCount: number;
  errors: string[];
};

export async function validateAuditHashChain(
  tenantId: string,
): Promise<AuditChainValidation> {
  const events = await requireDatabase()
    .select()
    .from(auditEventsTable)
    .where(eq(auditEventsTable.tenantId, tenantId))
    .orderBy(asc(auditEventsTable.sequenceId));
  const errors: string[] = [];
  let previousHash: string | null = null;
  let previousSequenceId = 0;

  for (const event of events) {
    if (event.sequenceId <= previousSequenceId) {
      errors.push(`Invalid sequence_id at sequence_id ${event.sequenceId}.`);
    }

    if (event.previousHash !== previousHash) {
      errors.push(`Invalid previous_hash at sequence_id ${event.sequenceId}.`);
    }

    const metadataResult = await requireDatabase().execute(
      sql`select ${JSON.stringify(event.metadata)}::jsonb::text as metadata_text`,
    );
    const [metadataRow] = metadataResult.rows as unknown as Array<{
      metadata_text: string;
    }>;
    const expectedHash: string = metadataRow?.metadata_text
      ? hashAuditEvent({
          sequenceId: event.sequenceId,
          previousHash: event.previousHash,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          actorId: event.actorId,
          metadataText: metadataRow.metadata_text,
          createdAt: event.createdAt,
        })
      : "";
    if (event.eventHash !== expectedHash) {
      errors.push(`Invalid event_hash at sequence_id ${event.sequenceId}.`);
    }
    previousHash = event.eventHash;
    previousSequenceId = event.sequenceId;
  }

  return { valid: errors.length === 0, eventCount: events.length, errors };
}

async function calculateDatabaseChecksum(tenantId: string): Promise<string> {
  const database = requireDatabase();
  const [audit, trust, integrity, recovery, runtime] = await Promise.all([
    database
      .select()
      .from(auditEventsTable)
      .where(eq(auditEventsTable.tenantId, tenantId)),
    database
      .select()
      .from(trustMetadataTable)
      .where(eq(trustMetadataTable.tenantId, tenantId)),
    database
      .select()
      .from(integrityChecksTable)
      .where(eq(integrityChecksTable.tenantId, tenantId)),
    database
      .select()
      .from(recoveryPointsTable)
      .where(eq(recoveryPointsTable.tenantId, tenantId)),
    database
      .select()
      .from(coreRuntimeStateTable)
      .where(eq(coreRuntimeStateTable.tenantId, tenantId)),
  ]);
  return hashIntegrityValue({ audit, trust, integrity, recovery, runtime });
}

export async function createIntegrityCheck(
  tenantId: string,
  expectedChecksum?: string,
): Promise<IntegrityResult> {
  const actualChecksum = await calculateDatabaseChecksum(tenantId);
  const auditChain = await validateAuditHashChain(tenantId);
  const status =
    !auditChain.valid || (expectedChecksum && expectedChecksum !== actualChecksum)
      ? "FAILED"
      : "PASSED";
  const checkedAt = new Date();
  const checkId = randomUUID();
  await requireDatabase().insert(integrityChecksTable).values({
    checkId,
    tenantId,
    scope: "enterprise-core",
    status,
    expectedChecksum,
    actualChecksum,
    details: {
      tables: [
        "audit_events",
        "trust_metadata",
        "integrity_checks",
        "recovery_points",
        "core_runtime_state",
      ],
      auditChain,
    },
    checkedAt,
  });

  if (status === "FAILED") {
    await setRecoveryMode(
      tenantId,
      "READ_ONLY",
      "Integrity checksum mismatch detected.",
    );
  }

  return {
    checkId,
    scope: "enterprise-core",
    status,
    ...(expectedChecksum ? { expectedChecksum } : {}),
    actualChecksum,
    checkedAt: checkedAt.toISOString(),
  };
}

export async function createRecoveryPoint(input: {
  tenantId: string;
  kind: "BACKUP" | "ROLLBACK";
  label?: string;
  source?: string;
  checksum?: string;
  metadata?: Record<string, unknown>;
}) {
  const recoveryPoint = {
    recoveryPointId: randomUUID(),
    tenantId: input.tenantId,
    kind: input.kind,
    status: "CREATED" as const,
    label: input.label,
    source: input.source,
    checksum: input.checksum,
    metadata: input.metadata ?? {},
    createdAt: new Date(),
  };
  await requireDatabase().insert(recoveryPointsTable).values(recoveryPoint);
  return recoveryPoint;
}

export async function getRecoveryState(tenantId: string) {
  if (!db) {
    return {
      stateId: DEFAULT_STATE_ID,
      tenantId,
      mode: runtimeMode,
      reason: runtimeReason,
    };
  }
  const [state] = await db
    .select()
    .from(coreRuntimeStateTable)
    .where(
      and(
        eq(coreRuntimeStateTable.tenantId, tenantId),
        eq(coreRuntimeStateTable.stateId, DEFAULT_STATE_ID),
      ),
    )
    .limit(1);
  return state ?? {
    stateId: DEFAULT_STATE_ID,
    tenantId,
    mode: runtimeMode,
    reason: runtimeReason,
  };
}

export async function setRecoveryMode(
  tenantId: string,
  mode: RecoveryMode,
  reason?: string,
): Promise<void> {
  runtimeMode = mode;
  runtimeReason = reason;
  if (!db) {
    return;
  }
  await db
    .insert(coreRuntimeStateTable)
    .values({
      stateId: DEFAULT_STATE_ID,
      tenantId,
      mode,
      reason,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [coreRuntimeStateTable.tenantId, coreRuntimeStateTable.stateId],
      set: { mode, reason, updatedAt: new Date() },
    });
}

export async function initialiseEnterpriseCore(): Promise<void> {
  if (!db) {
    return;
  }
}

export async function assertWritableRuntime(tenantId: string): Promise<void> {
  const state = await getRecoveryState(tenantId);
  if (state.mode !== "NORMAL") {
    throw new Error(`Enterprise Core is ${state.mode.toLowerCase()}: ${state.reason ?? "no reason provided"}`);
  }
}