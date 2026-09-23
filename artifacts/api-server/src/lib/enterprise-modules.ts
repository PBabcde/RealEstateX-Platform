import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { db } from "@workspace/db";
import { moduleDataTable } from "@workspace/db/schema";
import {
  registerTrustMetadata,
  recordAuditEvent,
} from "./enterprise-core";
import { calculateDealScore, type DealScore } from "./deal-score";
import { analyseEnergy, type EnergyAnalysis } from "./energy-analysis";
import {
  calculateNetRoi,
  calculateSubsidies,
  type SubsidyTrigger,
} from "./subsidy-engine";

export type DealRecord = {
  dealId: string;
  propertyId: string;
  title: string;
  region: string;
  propertyType: string;
  energyLabel: string;
  woonoppervlak: number;
  askingPrice: number;
  renovationCost: number;
  expectedValue: number;
  monthlyRent: number;
  municipality?: string;
  status: "DRAFT" | "REVIEW" | "GO" | "HOLD" | "REJECT";
  ownerId: string;
  score: DealScore;
  createdAt: string;
  updatedAt: string;
};

export type InvestorRecord = {
  investorId: string;
  name: string;
  email: string;
  company?: string;
  riskProfile: "LOW" | "MEDIUM" | "HIGH";
  budgetMin: number;
  budgetMax: number;
  preferredRegions: string[];
  interests: string[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmContactRecord = {
  contactId: string;
  type: "INVESTOR" | "MAKELAAR" | "PARTNER";
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  status: "ACTIVE" | "INACTIVE";
  notes?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmActivityRecord = {
  activityId: string;
  contactId: string;
  kind: "NOTE" | "CALL" | "EMAIL" | "MEETING";
  summary: string;
  occurredAt: string;
  actorId: string;
  ownerId: string;
  createdAt: string;
};

type EnterpriseEntity =
  | DealRecord
  | InvestorRecord
  | CrmContactRecord
  | CrmActivityRecord;
type EntityKind = "deal" | "investor" | "crm-contact" | "crm-activity";
const moduleName = "EnterpriseModulesX";

function requireDatabase() {
  if (!db) {
    throw new Error(
      "PostgreSQL is required for tenant-safe Enterprise modules. Set DATABASE_URL before using Fase 2-8 APIs.",
    );
  }
  return db;
}

function dataKey(kind: EntityKind, id: string): string {
  return `${kind}:${id}`;
}

function entityId(kind: EntityKind, entity: EnterpriseEntity): string {
  if (kind === "deal") return (entity as DealRecord).dealId;
  if (kind === "investor") return (entity as InvestorRecord).investorId;
  if (kind === "crm-activity") return (entity as CrmActivityRecord).activityId;
  return (entity as CrmContactRecord).contactId;
}

function entityType(kind: EntityKind): string {
  return kind === "crm-contact" ? "crm_contact" : kind;
}

async function listFromJson<T>(kind: EntityKind, tenantId: string): Promise<T[]> {
  const { readModuleData } = await import("./realestatex-storage");
  return readModuleData<T[]>(`${kind}.json`, [], tenantId);
}

async function writeJsonCollection<T>(
  kind: EntityKind,
  tenantId: string,
  values: T[],
): Promise<void> {
  const { writeModuleData } = await import("./realestatex-storage");
  await writeModuleData(`${kind}.json`, values, tenantId);
}

export async function listEntities<T extends EnterpriseEntity>(
  kind: EntityKind,
  tenantId: string,
): Promise<T[]> {
  const database = db;
  if (!database) return listFromJson<T>(kind, tenantId);
  const rows = await database
    .select({ data: moduleDataTable.data })
    .from(moduleDataTable)
    .where(
      and(
        eq(moduleDataTable.tenantId, tenantId),
        eq(moduleDataTable.moduleName, moduleName),
        like(moduleDataTable.dataKey, `${kind}:%`),
      ),
    );
  return rows.map((row) => row.data as T);
}

export async function getEntity<T extends EnterpriseEntity>(
  kind: EntityKind,
  id: string,
  tenantId: string,
): Promise<T | undefined> {
  const database = db;
  if (!database) {
    const values = await listFromJson<T>(kind, tenantId);
    return values.find((value) => entityId(kind, value) === id);
  }
  const [row] = await database
    .select({ data: moduleDataTable.data })
    .from(moduleDataTable)
    .where(
      and(
        eq(moduleDataTable.tenantId, tenantId),
        eq(moduleDataTable.moduleName, moduleName),
        eq(moduleDataTable.dataKey, dataKey(kind, id)),
      ),
    )
    .limit(1);
  return row?.data as T | undefined;
}

export async function saveEntity<T extends EnterpriseEntity>(
  kind: EntityKind,
  value: T,
  tenantId: string,
  actorId: string,
  action: "created" | "updated",
): Promise<T> {
  const id = entityId(kind, value);
  if (!id) throw new Error("Enterprise entity requires a stable ID.");
  const database = db;
  if (!database) {
    const values = await listFromJson<T>(kind, tenantId);
    const next = values.filter((item) => entityId(kind, item) !== id);
    next.push(value);
    await writeJsonCollection(kind, tenantId, next);
  } else {
    await requireDatabase()
      .insert(moduleDataTable)
      .values({
        tenantId,
        moduleName,
        dataKey: dataKey(kind, id),
        data: value as Record<string, unknown>,
        sourceFile: `${kind}.json`,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          moduleDataTable.tenantId,
          moduleDataTable.moduleName,
          moduleDataTable.dataKey,
        ],
        set: {
          data: value as Record<string, unknown>,
          sourceFile: `${kind}.json`,
          updatedAt: new Date(),
        },
      });
  }
  await registerTrustMetadata({
    tenantId,
    entityType: entityType(kind),
    entityId: id,
    sourceClass: "CANONICAL",
    sourceBoundary: `enterprise:${kind}`,
    sourceReference: `${kind}.json`,
    content: value,
  });
  await recordAuditEvent({
    tenantId,
    actorId,
    action: `enterprise.${kind}.${action}`,
    entityType: entityType(kind),
    entityId: id,
    metadata: { module: moduleName },
  });
  return value;
}

export async function deleteEntity(
  kind: EntityKind,
  id: string,
  tenantId: string,
  actorId: string,
): Promise<boolean> {
  const existing = await getEntity(kind, id, tenantId);
  if (!existing) return false;
  if (db) {
    await requireDatabase()
      .delete(moduleDataTable)
      .where(
        and(
          eq(moduleDataTable.tenantId, tenantId),
          eq(moduleDataTable.moduleName, moduleName),
          eq(moduleDataTable.dataKey, dataKey(kind, id)),
        ),
      );
  } else {
    const values = await listFromJson<EnterpriseEntity>(kind, tenantId);
    await writeJsonCollection(
      kind,
      tenantId,
      values.filter((value) => entityId(kind, value) !== id),
    );
  }
  await recordAuditEvent({
    tenantId,
    actorId,
    action: `enterprise.${kind}.deleted`,
    entityType: entityType(kind),
    entityId: id,
    metadata: { module: moduleName },
  });
  return true;
}

export function enrichDeal(deal: DealRecord): {
  deal: DealRecord;
  energy: EnergyAnalysis;
  subsidies: { triggers: SubsidyTrigger[]; totalEstimatedAmount: number };
  netRoi: ReturnType<typeof calculateNetRoi>;
} {
  const energy = analyseEnergy({
    energyLabel: deal.energyLabel,
    woonoppervlak: deal.woonoppervlak,
    renovationCost: deal.renovationCost,
    expectedValue: deal.expectedValue,
  });
  const subsidies = calculateSubsidies({
    renovationCost: deal.renovationCost,
    energy,
    municipality: deal.municipality,
  });
  const netRoi = calculateNetRoi({
    askingPrice: deal.askingPrice,
    renovationCost: deal.renovationCost,
    expectedValue: energy.revisedValue,
    subsidyAmount: subsidies.totalEstimatedAmount,
  });
  const score = calculateDealScore({
    askingPrice: deal.askingPrice,
    renovationCost: deal.renovationCost,
    expectedValue: energy.revisedValue,
    monthlyRent: deal.monthlyRent,
    energyScore: energy.labelScore,
    subsidyAmount: subsidies.totalEstimatedAmount,
  });
  return {
    deal: { ...deal, score },
    energy,
    subsidies,
    netRoi,
  };
}

export function createId(): string {
  return randomUUID();
}