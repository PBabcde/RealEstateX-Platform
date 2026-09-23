import { createHash, randomUUID } from "node:crypto";
import { asc, desc, eq, gte, lte, and } from "drizzle-orm";
import { db } from "@workspace/db";
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
  entityType: string;
  entityId: string;
  sourceClass: TrustSourceClass;
  sourceBoundary: string;
  sourceReference?: string;
  metadata?: Record<string, unknown>;
  content?: unknown;
};

export type AuditEventInput = {
  action: string;
  entityType: string;
  entityId?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
};

export type AuditEventFilter = {
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
      target: [trustMetadataTable.entityType, trustMetadataTable.entityId],
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
  entityType: string,
  entityId: string,
) {
  const [metadata] = await requireDatabase()
    .select()
    .from(trustMetadataTable)
    .where(
      and(
        eq(trustMetadataTable.entityType, entityType),
        eq(trustMetadataTable.entityId, entityId),
      ),
    )
    .limit(1);
  return metadata;
}

export async function recordAuditEvent(input: AuditEventInput) {
  const event = {
    eventId: randomUUID(),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: input.actorId,
    metadata: input.metadata ?? {},
    createdAt: new Date(),
  };
  await requireDatabase().insert(auditEventsTable).values(event);
  return event;
}

export async function queryAuditEvents(filter: AuditEventFilter = {}) {
  const conditions = [];
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
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}) {
  return {
    eventId: event.eventId,
    timestamp: event.createdAt.toISOString(),
    actor: event.actorId ?? "system",
    action: event.action,
    entity: event.entityId
      ? `${event.entityType}/${event.entityId}`
      : event.entityType,
    details: event.metadata,
  };
}

async function calculateDatabaseChecksum(): Promise<string> {
  const database = requireDatabase();
  const [audit, trust, integrity, recovery, runtime] = await Promise.all([
    database.select().from(auditEventsTable),
    database.select().from(trustMetadataTable),
    database.select().from(integrityChecksTable),
    database.select().from(recoveryPointsTable),
    database.select().from(coreRuntimeStateTable),
  ]);
  return hashIntegrityValue({ audit, trust, integrity, recovery, runtime });
}

export async function createIntegrityCheck(
  expectedChecksum?: string,
): Promise<IntegrityResult> {
  const actualChecksum = await calculateDatabaseChecksum();
  const status = expectedChecksum && expectedChecksum !== actualChecksum
    ? "FAILED"
    : "PASSED";
  const checkedAt = new Date();
  const checkId = randomUUID();
  await requireDatabase().insert(integrityChecksTable).values({
    checkId,
    scope: "enterprise-core",
    status,
    expectedChecksum,
    actualChecksum,
    details: { tables: ["audit_events", "trust_metadata", "integrity_checks", "recovery_points", "core_runtime_state"] },
    checkedAt,
  });

  if (status === "FAILED") {
    await setRecoveryMode("READ_ONLY", "Integrity checksum mismatch detected.");
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
  kind: "BACKUP" | "ROLLBACK";
  label?: string;
  source?: string;
  checksum?: string;
  metadata?: Record<string, unknown>;
}) {
  const recoveryPoint = {
    recoveryPointId: randomUUID(),
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

export async function getRecoveryState() {
  if (!db) {
    return { stateId: DEFAULT_STATE_ID, mode: runtimeMode, reason: runtimeReason };
  }
  const [state] = await db
    .select()
    .from(coreRuntimeStateTable)
    .where(eq(coreRuntimeStateTable.stateId, DEFAULT_STATE_ID))
    .limit(1);
  return state ?? {
    stateId: DEFAULT_STATE_ID,
    mode: runtimeMode,
    reason: runtimeReason,
  };
}

export async function setRecoveryMode(
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
      mode,
      reason,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: coreRuntimeStateTable.stateId,
      set: { mode, reason, updatedAt: new Date() },
    });
}

export async function initialiseEnterpriseCore(): Promise<void> {
  if (!db) {
    return;
  }
  const state = await getRecoveryState();
  runtimeMode = state.mode as RecoveryMode;
  runtimeReason = state.reason ?? undefined;
}

export async function assertWritableRuntime(): Promise<void> {
  const state = await getRecoveryState();
  if (state.mode !== "NORMAL") {
    throw new Error(`Enterprise Core is ${state.mode.toLowerCase()}: ${state.reason ?? "no reason provided"}`);
  }
}