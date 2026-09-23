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
  UpdatePropertyBody,
  UpdatePropertyParams,
  UpdatePropertyResponse,
} from "@workspace/api-zod";
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

const router: IRouter = Router();
router.use(async (_req, _res, next): Promise<void> => {
  try {
    await initialiseRealEstateStorage();
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/properties", async (_req, res): Promise<void> => {
  res.json(
    ListPropertiesResponse.parse(Object.values(await loadProperties())),
  );
});

router.post("/properties", async (req, res): Promise<void> => {
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const propertyId = `property-${randomUUID()}`;
  const property: PropertyRecord = { propertyId, ...parsed.data };
  const created = await createProperty(property);
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

  const updated = await updateProperty(params.data.propertyId, body.data);
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
  if (!(await deleteProperty(params.data.propertyId))) {
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
  await writeModuleData("valuations.json", { last: { input: body.data, result } });
  res.json(CalculateValuationResponse.parse(result));
});

router.post("/rentals/overview", async (req, res): Promise<void> => {
  const body = CalculateRentalOverviewBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = calculateRental(body.data);
  await writeModuleData("rentals.json", { last: { input: body.data, result } });
  res.json(CalculateRentalOverviewResponse.parse(result));
});

router.post("/mortgages/calculate", async (req, res): Promise<void> => {
  const body = CalculateMortgageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = calculateMortgage(body.data);
  await writeModuleData("mortgages.json", { last: { input: body.data, result } });
  res.json(CalculateMortgageResponse.parse(result));
});

router.get("/market/trends", async (_req, res): Promise<void> => {
  const trend = await readModuleData("market.json", {
    status: "ok",
    trend: "Stijgende markt in stedelijke gebieden",
    change: 3.7,
    period: "Q3 2026",
  });
  res.json(GetMarketTrendsResponse.parse(trend));
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const summary = buildDashboardSummary(Object.values(await loadProperties()));
  res.json(GetDashboardSummaryResponse.parse(summary));
});

export default router;