import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  CreatePropertyBody,
  CreatePropertyResponse,
  DeletePropertyParams,
  GetDashboardSummaryResponse,
  GetMarketTrendsResponse,
  GetPropertyParams,
  GetPropertyResponse,
  GetPropertyEnergyBrainResponse,
  GetPropertyReportResponse,
  ReplacePropertyBody,
  ListPropertiesResponse,
  ListEnergyXRenovationScenariosResponse,
  SaveEnergyXRenovationScenarioBody,
  SaveEnergyXRenovationScenarioResponse,
  UpdatePropertyBody,
  UpdatePropertyParams,
  UpdatePropertyResponse,
} from "@workspace/api-zod";
import { and, desc, eq, gt } from "drizzle-orm";
import { energyxRenovationScenariosTable, requireDb } from "@workspace/db";
import {
  buildDashboardSummary,
} from "../lib/realestatex-modules";
import {
  createProperty,
  deleteProperty,
  getProperty,
  initialiseRealEstateStorage,
  loadProperties,
  readModuleData,
  updateProperty,
  type PropertyRecord,
} from "../lib/realestatex-storage";
import {
  canAccessOwner,
  canManageOwner,
  forbidden,
  isAdministrator,
  requireAuthentication,
} from "../middlewares/authorization";
import { attachEnterpriseContext } from "../lib/enterprise-core-access";
import { calculateEnergyBrain, EnergyBrainInputError } from "../lib/energy-brain";
import { generateRealEstateReport } from "../lib/real-estate-report";
import { renderRealEstateReportPdf } from "../lib/real-estate-report-pdf";

const router: IRouter = Router();
const ENERGYX_SCENARIO_RETENTION_DAYS = 365;

function normalizedPropertyInput(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const result = { ...body } as Record<string, unknown>;
  for (const key of ["naam", "adres", "postcode", "plaats", "type", "energielabel"]) {
    if (typeof result[key] === "string") result[key] = result[key].trim();
  }
  return result;
}

async function reportForRequest(
  req: Parameters<typeof requireAuthentication>[0],
  res: Parameters<typeof requireAuthentication>[1],
) {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return undefined;
  }
  const property = await getProperty(params.data.propertyId);
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return undefined;
  }
  if (!canAccessOwner(req, property.ownerId)) {
    forbidden(res);
    return undefined;
  }
  try {
    return GetPropertyReportResponse.parse(generateRealEstateReport(property));
  } catch (error) {
    if (!(error instanceof EnergyBrainInputError)) throw error;
    res.status(400).json({ error: error.message });
    return undefined;
  }
}

function scenarioResponse(row: typeof energyxRenovationScenariosTable.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    energyLabel: row.energyLabel,
    wwsScore: row.wwsScore,
    maxRentEur: row.maxRentEur,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

router.use(requireAuthentication);
router.use(attachEnterpriseContext);
router.use(async (_req, _res, next): Promise<void> => {
  try {
    await initialiseRealEstateStorage();
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/energyx/renovation-scenarios", async (req, res): Promise<void> => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
  if (!projectId || projectId.length > 100) {
    res.status(400).json({ error: "A valid projectId is required." });
    return;
  }

  const tenantId = req.enterpriseContext!.tenantId;
  const userId = req.dbUser!.id;
  const now = new Date();
  const rows = await requireDb().db
    .select()
    .from(energyxRenovationScenariosTable)
    .where(and(
      eq(energyxRenovationScenariosTable.tenantId, tenantId),
      eq(energyxRenovationScenariosTable.userId, userId),
      eq(energyxRenovationScenariosTable.projectId, projectId),
    ))
    .orderBy(desc(energyxRenovationScenariosTable.createdAt));
  const current = rows
    .filter((row) => row.expiresAt > now)
    .map(scenarioResponse);
  const expiredCount = rows.filter((row) => row.expiresAt <= now).length;
  res.json(ListEnergyXRenovationScenariosResponse.parse({
    scenarios: current,
    expiredCount,
    retentionDays: ENERGYX_SCENARIO_RETENTION_DAYS,
  }));
});

router.post("/energyx/renovation-scenarios", async (req, res): Promise<void> => {
  const body = SaveEnergyXRenovationScenarioBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { projectId, title, energyLabel, wwsScore, maxRentEur } = body.data;
  if (!title.trim() || ![energyLabel, wwsScore, maxRentEur].some((value) => value !== undefined && value !== null)) {
    res.status(400).json({ error: "At least one returned EnergyX result is required." });
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ENERGYX_SCENARIO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [saved] = await requireDb().db
    .insert(energyxRenovationScenariosTable)
    .values({
      tenantId: req.enterpriseContext!.tenantId,
      userId: req.dbUser!.id,
      projectId,
      title: title.trim(),
      energyLabel: energyLabel?.trim() || null,
      wwsScore: wwsScore ?? null,
      maxRentEur: maxRentEur ?? null,
      expiresAt,
    })
    .returning();
  res.status(201).json(SaveEnergyXRenovationScenarioResponse.parse(scenarioResponse(saved)));
});

router.get("/properties", async (req, res): Promise<void> => {
  res.json(
    ListPropertiesResponse.parse(
      Object.values(await loadProperties(isAdministrator(req) ? undefined : req.dbUser!.id)),
    ),
  );
});

router.post("/properties", async (req, res): Promise<void> => {
  const parsed = CreatePropertyBody.safeParse(normalizedPropertyInput(req.body));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const propertyId = `property-${randomUUID()}`;
  const property: PropertyRecord = { propertyId, ownerId: req.dbUser!.id, ...parsed.data };
  const created = await createProperty(
    property,
    req.dbUser!.id,
    req.enterpriseContext!.tenantId,
  );
  res.status(201).json(CreatePropertyResponse.parse(created));
});

router.get("/properties/:propertyId", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const property = await getProperty(params.data.propertyId);
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  if (!canAccessOwner(req, property.ownerId)) {
    forbidden(res);
    return;
  }
  res.json(GetPropertyResponse.parse(property));
});

router.get("/properties/:propertyId/energy-brain", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const property = await getProperty(params.data.propertyId);
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  if (!canAccessOwner(req, property.ownerId)) {
    forbidden(res);
    return;
  }
  try {
    res.json(GetPropertyEnergyBrainResponse.parse({
      property_id: property.propertyId,
      ...calculateEnergyBrain(property.energielabel, property.bouwjaar, property.woonoppervlak),
    }));
  } catch (error) {
    if (!(error instanceof EnergyBrainInputError)) throw error;
    res.status(400).json({ error: error.message });
  }
});

router.get("/properties/:propertyId/report", async (req, res): Promise<void> => {
  const report = await reportForRequest(req, res);
  if (!report) return;
  res.setHeader("Cache-Control", "private, no-store");
  res.json(report);
});

router.get("/properties/:propertyId/report/pdf", async (req, res): Promise<void> => {
  const report = await reportForRequest(req, res);
  if (!report) return;
  const pdf = await renderRealEstateReportPdf(report);
  const safeId = report.property.property_id.replace(/[^a-zA-Z0-9_-]/g, "-");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="realestatex-rapport-${safeId}.pdf"`);
  res.setHeader("Content-Length", pdf.byteLength);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(pdf);
});

router.put("/properties/:propertyId", async (req, res): Promise<void> => {
  const params = UpdatePropertyParams.safeParse(req.params);
  const body = ReplacePropertyBody.safeParse(normalizedPropertyInput(req.body));
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !body.success ? body.error.message : "Invalid input" });
    return;
  }
  const property = await getProperty(params.data.propertyId);
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  if (!canManageOwner(req, property.ownerId)) {
    forbidden(res);
    return;
  }
  const updated = await updateProperty(
    params.data.propertyId,
    {
      ...body.data,
      naam: body.data.naam ?? null,
      postcode: body.data.postcode ?? null,
      plaats: body.data.plaats ?? null,
      huurprijs: body.data.huurprijs ?? null,
      marktwaarde: body.data.marktwaarde ?? null,
      perceel: body.data.perceel ?? null,
      kenmerken: body.data.kenmerken ?? {},
    },
    req.dbUser!.id,
    isAdministrator(req) ? undefined : req.dbUser!.id,
    req.enterpriseContext!.tenantId,
  );
  if (!updated) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.json(UpdatePropertyResponse.parse(updated));
});

router.patch("/properties/:propertyId", async (req, res): Promise<void> => {
  const params = UpdatePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdatePropertyBody.safeParse(normalizedPropertyInput(req.body));
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Geef minimaal één wijzigbaar dossierkenmerk op." });
    return;
  }

  const property = await getProperty(params.data.propertyId);
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  if (!canManageOwner(req, property.ownerId)) {
    forbidden(res);
    return;
  }
  const updated = await updateProperty(
    params.data.propertyId,
    body.data,
    req.dbUser!.id,
    isAdministrator(req) ? undefined : req.dbUser!.id,
    req.enterpriseContext!.tenantId,
  );
  if (!updated) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.json(UpdatePropertyResponse.parse(updated));
});

router.delete("/properties/:propertyId", async (req, res): Promise<void> => {
  const params = DeletePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const property = await getProperty(params.data.propertyId);
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  if (!canManageOwner(req, property.ownerId)) {
    forbidden(res);
    return;
  }
  if (
    !(await deleteProperty(
      params.data.propertyId,
      req.dbUser!.id,
      isAdministrator(req) ? undefined : req.dbUser!.id,
      req.enterpriseContext!.tenantId,
    ))
  ) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/market/trends", async (req, res): Promise<void> => {
  const trend = await readModuleData(
    "market.json",
    {
      status: "ok",
      trend: "Stijgende markt in stedelijke gebieden",
      change: 3.7,
      period: "Q3 2026",
    },
    req.enterpriseContext!.tenantId,
  );
  res.json(GetMarketTrendsResponse.parse(trend));
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const summary = buildDashboardSummary(
    Object.values(await loadProperties(isAdministrator(req) ? undefined : req.dbUser!.id)),
  );
  res.json(GetDashboardSummaryResponse.parse(summary));
});

export default router;