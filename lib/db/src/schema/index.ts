import { relations, sql } from "drizzle-orm";
import {
  bigint,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  index,
  check,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { DEFAULT_TENANT_ID, tenantsTable } from "./auth";
export * from "./auth";
export * from "./property-beta";
export * from "./sales";

export type PropertyFeatures = Record<string, string>;

export const propertiesTable = pgTable(
  "properties",
  {
    propertyId: text("property_id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    adres: text("adres").notNull(),
    type: text("type").notNull(),
    bouwjaar: integer("bouwjaar").notNull(),
    woonoppervlak: integer("woonoppervlak").notNull(),
    perceel: integer("perceel"),
    energielabel: text("energielabel").notNull(),
    kenmerken: jsonb("kenmerken")
      .$type<PropertyFeatures>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    addressIndex: index("properties_adres_idx").on(table.adres),
  }),
);

export const moduleDataTable = pgTable(
  "module_data",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id),
    moduleName: text("module_name").notNull(),
    dataKey: text("data_key").notNull(),
    data: jsonb("data").notNull(),
    sourceFile: text("source_file"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    moduleDataPrimaryKey: primaryKey({
      columns: [table.tenantId, table.moduleName, table.dataKey],
    }),
    moduleDataTenantUpdatedIndex: index("module_data_tenant_updated_idx").on(
      table.tenantId,
      table.updatedAt,
    ),
  }),
);

export const chatSessionsTable = pgTable("chat_sessions", {
  sessionId: text("session_id").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    messageId: text("message_id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessionsTable.sessionId, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    sessionCreatedIndex: index("chat_messages_session_created_idx").on(
      table.sessionId,
      table.createdAt,
      table.messageId,
    ),
  }),
);

export const auditEventsTable = pgTable(
  "audit_events",
  {
    eventId: text("event_id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id),
    sequenceId: bigint("sequence_id", { mode: "number" }).notNull(),
    previousHash: text("previous_hash"),
    eventHash: text("event_hash").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    actorId: text("actor_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    auditTenantSequenceIndex: index("audit_events_tenant_sequence_idx").on(
      table.tenantId,
      table.sequenceId,
    ),
    auditTenantSequenceUnique: unique("audit_events_tenant_sequence_unique").on(
      table.tenantId,
      table.sequenceId,
    ),
  }),
);

export const trustMetadataTable = pgTable(
  "trust_metadata",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    sourceClass: text("source_class").notNull(),
    sourceBoundary: text("source_boundary").notNull(),
    sourceReference: text("source_reference"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    trustMetadataPrimaryKey: primaryKey({
      columns: [table.tenantId, table.entityType, table.entityId],
    }),
    trustSourceClassCheck: check(
      "trust_metadata_source_class_check",
      sql`${table.sourceClass} in ('CANONICAL', 'SHADOW', 'PAPER', 'LIVE')`,
    ),
    trustBoundaryIndex: index("trust_metadata_boundary_idx").on(
      table.tenantId,
      table.sourceBoundary,
    ),
  }),
);

export const recoveryPointsTable = pgTable(
  "recovery_points",
  {
    recoveryPointId: text("recovery_point_id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    label: text("label"),
    checksum: text("checksum"),
    source: text("source"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => ({
    recoveryPointStatusIndex: index("recovery_points_status_idx").on(
      table.tenantId,
      table.status,
      table.createdAt,
    ),
    recoveryPointKindCheck: check(
      "recovery_points_kind_check",
      sql`${table.kind} in ('BACKUP', 'ROLLBACK')`,
    ),
    recoveryPointStatusCheck: check(
      "recovery_points_status_check",
      sql`${table.status} in ('CREATED', 'VERIFIED', 'FAILED', 'RESTORED')`,
    ),
  }),
);

export const integrityChecksTable = pgTable(
  "integrity_checks",
  {
    checkId: text("check_id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id),
    scope: text("scope").notNull(),
    status: text("status").notNull(),
    expectedChecksum: text("expected_checksum"),
    actualChecksum: text("actual_checksum").notNull(),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    integrityChecksScopeIndex: index("integrity_checks_scope_idx").on(
      table.tenantId,
      table.scope,
      table.checkedAt,
    ),
    integrityChecksStatusCheck: check(
      "integrity_checks_status_check",
      sql`${table.status} in ('PASSED', 'FAILED')`,
    ),
  }),
);

export const coreRuntimeStateTable = pgTable(
  "core_runtime_state",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id),
    stateId: text("state_id").notNull(),
    mode: text("mode").notNull(),
    reason: text("reason"),
    lastIntegrityCheckId: text("last_integrity_check_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    coreRuntimeStatePrimaryKey: primaryKey({
      columns: [table.tenantId, table.stateId],
    }),
    coreRuntimeModeCheck: check(
      "core_runtime_state_mode_check",
      sql`${table.mode} in ('NORMAL', 'READ_ONLY', 'RECOVERY')`,
    ),
  }),
);

export const chatSessionsRelations = relations(chatSessionsTable, ({ many }) => ({
  messages: many(chatMessagesTable),
}));

export const chatMessagesRelations = relations(chatMessagesTable, ({ one }) => ({
  session: one(chatSessionsTable, {
    fields: [chatMessagesTable.sessionId],
    references: [chatSessionsTable.sessionId],
  }),
}));

export type Property = typeof propertiesTable.$inferSelect;
export type NewProperty = typeof propertiesTable.$inferInsert;
export type ModuleData = typeof moduleDataTable.$inferSelect;
export type ChatSession = typeof chatSessionsTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type AuditEvent = typeof auditEventsTable.$inferSelect;
export type TrustMetadata = typeof trustMetadataTable.$inferSelect;
export type RecoveryPoint = typeof recoveryPointsTable.$inferSelect;
export type IntegrityCheck = typeof integrityChecksTable.$inferSelect;
export type CoreRuntimeState = typeof coreRuntimeStateTable.$inferSelect;
