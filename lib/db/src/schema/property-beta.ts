import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantsTable, usersTable } from "./auth";

export const propertyAnalysisUsageTable = pgTable(
  "property_analysis_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("reserved"),
    reservedUntil: timestamp("reserved_until", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("property_analysis_usage_scope_idx").on(
      table.tenantId,
      table.userId,
      table.status,
      table.reservedUntil,
    ),
    index("property_analysis_usage_reservation_expiry_idx").on(
      table.status,
      table.reservedUntil,
    ),
    check(
      "property_analysis_usage_status_check",
      sql`${table.status} in ('reserved', 'completed')`,
    ),
  ],
);

export const propertyBetaWaitlistTable = pgTable(
  "property_beta_waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 254 }).notNull(),
    consent: boolean("consent").notNull(),
    consentVersion: varchar("consent_version", { length: 80 }).notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("property_beta_waitlist_tenant_user_unique").on(
      table.tenantId,
      table.userId,
    ),
    check("property_beta_waitlist_consent_check", sql`${table.consent} = true`),
  ],
);

export type PropertyAnalysisUsage = typeof propertyAnalysisUsageTable.$inferSelect;
export type PropertyBetaWaitlistLead = typeof propertyBetaWaitlistTable.$inferSelect;
