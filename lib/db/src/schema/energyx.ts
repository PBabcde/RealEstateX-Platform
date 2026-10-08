import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
