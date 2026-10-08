import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { DEFAULT_TENANT_ID, energyxSyncsTable, requireDb } from "@workspace/db";
import { getProperty, initialiseRealEstateStorage } from "../lib/realestatex-storage";
import { canAccessOwner, isAdministrator, requireAuthentication } from "../middlewares/authorization";
import { recordAuditEvent } from "../lib/enterprise-core";
import {
  b2bView,
  b2cView,
  computeMetrics,
  type EnergyXSpecs,
  type SyncSnapshot,
} from "../lib/energyx-metrics";

const router: IRouter = Router();
const BASE = "/v1/energyx";
router.use(BASE, requireAuthentication);

const GLAZING = new Set(["enkel", "dubbel", "hr++", "drievoudig"]);
const SERVICE_KINDS = new Set(["service", "maintenance"]);

function optionalNumber(value: unknown, field: string, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    throw new Error(`${field} must be a number between 0 and ${max}.`);
  }
  return parsed;
}

function parseSpecs(raw: unknown): EnergyXSpecs {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const glazing = body.glazing ?? null;
  if (glazing !== null && !(typeof glazing === "string" && GLAZING.has(glazing))) {
    throw new Error("glazing must be one of enkel, dubbel, hr++, drievoudig.");
  }
  const connection = typeof body.connection === "string" ? body.connection.trim().slice(0, 40) : "";
  return {
    woz: optionalNumber(body.woz, "woz", 100_000_000),
    wwsPoints: optionalNumber(body.wwsPoints, "wwsPoints", 1000),
    wwsPointsGain: optionalNumber(body.wwsPointsGain, "wwsPointsGain", 1000),
    glazing: glazing as EnergyXSpecs["glazing"],
    heatingKw: optionalNumber(body.heatingKw, "heatingKw", 5000),
    coolingKw: optionalNumber(body.coolingKw, "coolingKw", 5000),
    roofAreaM2: optionalNumber(body.roofAreaM2, "roofAreaM2", 100_000),
    connection: connection || null,
  };
}

async function accessibleProperty(req: Request, res: Response, propertyId: unknown) {
  if (typeof propertyId !== "string" || !propertyId) {
    res.status(400).json({ error: "propertyId is required." });
    return undefined;
  }
  await initialiseRealEstateStorage();
  const property = await getProperty(propertyId);
  if (!property || !canAccessOwner(req, property.ownerId)) {
    res.status(404).json({ error: "Property not found." });
    return undefined;
  }
  return property;
}

function snapshotOf(payload: Record<string, unknown>): SyncSnapshot {
  return payload.snapshot as SyncSnapshot;
}

router.post(`${BASE}/sync`, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.consent !== true) {
      res.status(400).json({ error: "Expliciete toestemming (consent: true) is vereist voor synchronisatie." });
      return;
    }
    const property = await accessibleProperty(req, res, body.propertyId);
    if (!property) return;
    let specs: EnergyXSpecs;
    try {
      specs = parseSpecs(body.specs);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid specs." });
      return;
    }
    const snapshot: SyncSnapshot = {
      adres: property.adres,
      type: property.type,
      woonoppervlak: property.woonoppervlak,
      bouwjaar: property.bouwjaar,
      energielabel: property.energielabel,
      specs,
    };
    const metrics = computeMetrics(snapshot);
    const syncedAt = new Date();
    const payload = { snapshot, metrics, mode: "local-estimate" };
    await requireDb().db
      .insert(energyxSyncsTable)
      .values({ propertyId: property.propertyId, ownerId: property.ownerId, status: "synced", payload, syncedAt })
      .onConflictDoUpdate({
        target: energyxSyncsTable.propertyId,
        set: { status: "synced", payload, syncedAt, ownerId: property.ownerId },
      });
    await recordAuditEvent({
      tenantId: req.dbUser!.tenantId ?? DEFAULT_TENANT_ID,
      action: "energyx.sync",
      entityType: "property",
      entityId: property.propertyId,
      actorId: req.dbUser!.id,
      metadata: { mode: "local-estimate" },
    });
    res.json({ propertyId: property.propertyId, status: "synced", mode: "local-estimate", syncedAt: syncedAt.toISOString() });
  } catch (error) {
    next(error);
  }
});

router.get(`${BASE}/status/:propertyId`, async (req, res, next) => {
  try {
    const property = await accessibleProperty(req, res, req.params.propertyId);
    if (!property) return;
    const [row] = await requireDb().db.select().from(energyxSyncsTable).where(eq(energyxSyncsTable.propertyId, property.propertyId));
    if (!row) {
      res.json({ propertyId: property.propertyId, status: "not_synced", mode: "local-estimate" });
      return;
    }
    const stale = Boolean(snapshotOf(row.payload) && (
      snapshotOf(row.payload).energielabel !== property.energielabel ||
      snapshotOf(row.payload).woonoppervlak !== property.woonoppervlak
    ));
    res.json({
      propertyId: property.propertyId,
      status: stale ? "outdated" : row.status,
      mode: "local-estimate",
      syncedAt: row.syncedAt.toISOString(),
      specs: snapshotOf(row.payload).specs,
    });
  } catch (error) {
    next(error);
  }
});

router.get(`${BASE}/metrics/:propertyId`, async (req, res, next) => {
  try {
    const view = req.query.view === "b2c" ? "b2c" : req.query.view === "b2b" || req.query.view === undefined ? "b2b" : null;
    if (!view) {
      res.status(400).json({ error: "view must be b2b or b2c." });
      return;
    }
    const property = await accessibleProperty(req, res, req.params.propertyId);
    if (!property) return;
    const [row] = await requireDb().db.select().from(energyxSyncsTable).where(eq(energyxSyncsTable.propertyId, property.propertyId));
    if (!row) {
      res.status(409).json({ error: "Dit object is nog niet gesynchroniseerd met EnergyX." });
      return;
    }
    const snapshot = snapshotOf(row.payload);
    const metrics = computeMetrics(snapshot);
    const syncedAt = row.syncedAt.toISOString();
    res.json(view === "b2b" ? b2bView(snapshot, metrics, syncedAt) : b2cView(snapshot, metrics, syncedAt));
  } catch (error) {
    next(error);
  }
});

router.get(`${BASE}/portfolio`, async (req, res, next) => {
  try {
    const { db } = requireDb();
    const rows = isAdministrator(req)
      ? await db.select().from(energyxSyncsTable)
      : await db.select().from(energyxSyncsTable).where(eq(energyxSyncsTable.ownerId, req.dbUser!.id));
    const items = rows.map((row) => {
      const snapshot = snapshotOf(row.payload);
      return { propertyId: row.propertyId, adres: snapshot.adres, metrics: computeMetrics(snapshot) };
    });
    const sum = (pick: (m: (typeof items)[number]["metrics"]) => number) => items.reduce((t, i) => t + pick(i.metrics), 0);
    res.json({
      properties: items.length,
      totalAnnualSavings: sum((m) => m.annualSavings),
      totalInvestment: sum((m) => m.investments.total),
      totalSolarKwp: Number(sum((m) => m.solar.kwp).toFixed(1)),
      averageScore: items.length ? Math.round(sum((m) => m.sustainabilityScore) / items.length) : 0,
      items: items.map((i) => ({ propertyId: i.propertyId, adres: i.adres, score: i.metrics.sustainabilityScore, annualSavings: i.metrics.annualSavings })),
    });
  } catch (error) {
    next(error);
  }
});

router.post(`${BASE}/service-request`, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const property = await accessibleProperty(req, res, body.propertyId);
    if (!property) return;
    const kind = typeof body.kind === "string" && SERVICE_KINDS.has(body.kind) ? body.kind : "service";
    const note = typeof body.note === "string" ? body.note.replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(0, 500) : "";
    const requestId = randomUUID();
    await recordAuditEvent({
      tenantId: req.dbUser!.tenantId ?? DEFAULT_TENANT_ID,
      action: "energyx.service_request",
      entityType: "property",
      entityId: property.propertyId,
      actorId: req.dbUser!.id,
      metadata: { requestId, kind, note },
    });
    res.status(201).json({ requestId, kind, status: "received" });
  } catch (error) {
    next(error);
  }
});

export default router;
