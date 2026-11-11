import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  CalculateMortgageBody,
  CalculateMortgageResponse,
  CalculateRentalOverviewBody,
  CalculateRentalOverviewResponse,
  CalculateValuationBody,
  CalculateValuationResponse,
  CreatePropertyBody,
  CreatePropertyResponse,
  DeletePropertyParams,
  GetDashboardSummaryResponse,
  GetMarketTrendsResponse,
  GetPropertyParams,
  GetPropertyResponse,
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
  calculateMortgage,
  calculateRental,
  calculateValuation,
} from "../lib/realestatex-modules";
import {
  createProperty,
  deleteProperty,
  getProperty,
  initialiseRealEstateStorage,
  loadProperties,
  readModuleData,
  updateProperty,
  writeModuleData,
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

const router: IRouter = Router();
const ENERGYX_SCENARIO_RETENTION_DAYS = 365;

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
  const parsed = CreatePropertyBody.safeParse(req.body);
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

router.patch("/properties/:propertyId", async (req, res): Promise<void> => {
  const params = UpdatePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdatePropertyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
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

router.post("/valuations/calculate", async (req, res): Promise<void> => {
  const body = CalculateValuationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = calculateValuation(body.data);
  await writeModuleData(
    "valuations.json",
    { last: { input: body.data, result } },
    req.enterpriseContext!.tenantId,
  );
  res.json(CalculateValuationResponse.parse(result));
});

router.post("/rentals/overview", async (req, res): Promise<void> => {
  const body = CalculateRentalOverviewBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = calculateRental(body.data);
  await writeModuleData(
    "rentals.json",
    { last: { input: body.data, result } },
    req.enterpriseContext!.tenantId,
  );
  res.json(CalculateRentalOverviewResponse.parse(result));
});

router.post("/mortgages/calculate", async (req, res): Promise<void> => {
  const body = CalculateMortgageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = calculateMortgage(body.data);
  await writeModuleData(
    "mortgages.json",
    { last: { input: body.data, result } },
    req.enterpriseContext!.tenantId,
  );
  res.json(CalculateMortgageResponse.parse(result));
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