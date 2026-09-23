import { relations, sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export type PropertyFeatures = Record<string, string>;

export const propertiesTable = pgTable(
  "properties",
  {
    propertyId: text("property_id").primaryKey(),
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
      columns: [table.moduleName, table.dataKey],
    }),
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

export const auditEventsTable = pgTable("audit_events", {
  eventId: text("event_id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  actorId: text("actor_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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