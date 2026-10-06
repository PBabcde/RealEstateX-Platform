import { and, eq, gt, or } from "drizzle-orm";
import {
  propertyAnalysisUsageTable,
  propertyBetaWaitlistTable,
  requireDb,
  sql,
} from "@workspace/db";

export const FREE_PROPERTY_ANALYSIS_LIMIT = 3;
export const PROPERTY_BETA_CONSENT_VERSION = "realestatex-pro-beta-v1";
const ANALYSIS_RESERVATION_TTL_MS = 15 * 60 * 1000;

export type PropertyAccountScope = {
  tenantId: string;
  userId: string;
};

export type AnalysisReservation =
  | { status: "reserved"; reservationId: string; analysesUsed: number }
  | { status: "limit"; analysesUsed: number };

export type PropertyBetaService = {
  reserveAnalysis(scope: PropertyAccountScope): Promise<AnalysisReservation>;
  completeAnalysis(reservationId: string): Promise<void>;
  releaseAnalysis(reservationId: string): Promise<void>;
  registerWaitlistLead(input: PropertyAccountScope & { email: string }): Promise<{ consentedAt: Date }>;
};

export const propertyBetaService: PropertyBetaService = {
  async reserveAnalysis({ tenantId, userId }) {
    const { db } = requireDb();
    const now = new Date();
    const reservationScope = `${tenantId}:${userId}`;

    return db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${reservationScope}, 0))`,
      );
      const [usage] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(propertyAnalysisUsageTable)
        .where(
          and(
            eq(propertyAnalysisUsageTable.tenantId, tenantId),
            eq(propertyAnalysisUsageTable.userId, userId),
            or(
              eq(propertyAnalysisUsageTable.status, "completed"),
              and(
                eq(propertyAnalysisUsageTable.status, "reserved"),
                gt(propertyAnalysisUsageTable.reservedUntil, now),
              ),
            ),
          ),
        );
      const analysesUsed = Number(usage?.count ?? 0);
      if (analysesUsed >= FREE_PROPERTY_ANALYSIS_LIMIT) {
        return { status: "limit", analysesUsed } as const;
      }

      const [reservation] = await transaction
        .insert(propertyAnalysisUsageTable)
        .values({
          tenantId,
          userId,
          status: "reserved",
          reservedUntil: new Date(now.getTime() + ANALYSIS_RESERVATION_TTL_MS),
        })
        .returning({ id: propertyAnalysisUsageTable.id });
      if (!reservation) {
        throw new Error("Could not reserve a free property analysis.");
      }
      return {
        status: "reserved",
        reservationId: reservation.id,
        analysesUsed: analysesUsed + 1,
      } as const;
    });
  },

  async completeAnalysis(reservationId) {
    const { db } = requireDb();
    const [completed] = await db
      .update(propertyAnalysisUsageTable)
      .set({
        status: "completed",
        reservedUntil: null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(propertyAnalysisUsageTable.id, reservationId),
          eq(propertyAnalysisUsageTable.status, "reserved"),
        ),
      )
      .returning({ id: propertyAnalysisUsageTable.id });
    if (!completed) throw new Error("The property analysis reservation expired.");
  },

  async releaseAnalysis(reservationId) {
    const { db } = requireDb();
    await db
      .delete(propertyAnalysisUsageTable)
      .where(
        and(
          eq(propertyAnalysisUsageTable.id, reservationId),
          eq(propertyAnalysisUsageTable.status, "reserved"),
        ),
      );
  },

  async registerWaitlistLead({ tenantId, userId, email }) {
    const { db } = requireDb();
    const consentedAt = new Date();
    const [lead] = await db
      .insert(propertyBetaWaitlistTable)
      .values({
        tenantId,
        userId,
        email,
        consent: true,
        consentVersion: PROPERTY_BETA_CONSENT_VERSION,
        consentedAt,
      })
      .onConflictDoUpdate({
        target: [
          propertyBetaWaitlistTable.tenantId,
          propertyBetaWaitlistTable.userId,
        ],
        set: {
          email,
          consent: true,
          consentVersion: PROPERTY_BETA_CONSENT_VERSION,
          consentedAt,
          updatedAt: consentedAt,
        },
      })
      .returning({ consentedAt: propertyBetaWaitlistTable.consentedAt });
    if (!lead) throw new Error("The beta waitlist lead could not be saved.");
    return { consentedAt: lead.consentedAt };
  },
};
