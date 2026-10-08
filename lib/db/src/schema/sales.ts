import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { DEFAULT_TENANT_ID, tenantsTable } from "./auth";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const leadsTable = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    company: varchar("company", { length: 200 }),
    status: text("status").notNull().default("new"),
    leadScore: integer("lead_score").notNull().default(0),
    consent: boolean("consent").notNull(),
    consentVersion: varchar("consent_version", { length: 80 }).notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("leads_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
    index("leads_tenant_email_idx").on(table.tenantId, table.email),
    check("leads_status_check", sql`${table.status} in ('new', 'contacted', 'qualified', 'won', 'lost')`),
    check("leads_score_check", sql`${table.leadScore} between 0 and 100`),
    check("leads_consent_check", sql`${table.consent} = true`),
  ],
);

export const trafficEventsTable = pgTable(
  "traffic_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    pageUrl: varchar("page_url", { length: 300 }).notNull(),
    referrer: varchar("referrer", { length: 300 }),
    userAgent: varchar("user_agent", { length: 300 }),
    ipHash: varchar("ip_hash", { length: 64 }),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("traffic_events_tenant_time_idx").on(table.tenantId, table.timestamp),
    index("traffic_events_tenant_session_idx").on(table.tenantId, table.sessionId, table.timestamp),
  ],
);

export const crmInteractionsTable = pgTable(
  "crm_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    actionType: varchar("action_type", { length: 40 }).notNull(),
    notes: text("notes"),
    aiGeneratedSummary: text("ai_generated_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("crm_interactions_lead_idx").on(table.tenantId, table.leadId, table.createdAt)],
);

export type Lead = typeof leadsTable.$inferSelect;
export type TrafficEvent = typeof trafficEventsTable.$inferSelect;
export type CrmInteraction = typeof crmInteractionsTable.$inferSelect;
