import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar, doublePrecision } from "drizzle-orm/pg-core";
import { tenantsTable } from "./auth";

export const ENERGYX_SYNC_STATUSES = ["synced", "failed"] as const;
export type EnergyXSyncStatus = (typeof ENERGYX_SYNC_STATUSES)[number];

export const energyxSyncsTable = pgTable(
  "energyx_syncs",
  {
    propertyId: text("property_id").notNull(),
    ownerId: text("owner_id").notNull(),
    status: text("status").notNull().default("synced"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    propertyUnique: uniqueIndex("energyx_syncs_property_idx").on(table.propertyId),
  }),
);

export const energyxRenovationScenariosTable = pgTable(
  "energyx_renovation_scenarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 }).notNull(),
    projectId: varchar("project_id", { length: 100 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    energyLabel: varchar("energy_label", { length: 20 }),
    wwsScore: doublePrecision("wws_score"),
    maxRentEur: doublePrecision("max_rent_eur"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("energyx_renovation_scenarios_scope_idx").on(
      table.tenantId,
      table.userId,
      table.projectId,
      table.expiresAt,
    ),
  ],
);

export type EnergyXRenovationScenario =
  typeof energyxRenovationScenariosTable.$inferSelect;
