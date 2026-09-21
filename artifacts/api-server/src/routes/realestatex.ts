import { Router, type IRouter } from "express";
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
  initialiseRealEstateStorage,
  loadProperties,
  saveProperties,
  readJson,
  writeJson,
  type PropertyRecord,
} from "../lib/realestatex-storage";

const router: IRouter = Router();
initialiseRealEstateStorage();

router.get("/properties", (_req, res): void => {
  res.json(
    ListPropertiesResponse.parse(Object.values(loadProperties())),
  );
});

router.post("/properties", (req, res): void => {
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const propertyId = `property-${Date.now().toString(36)}`;
  const property: PropertyRecord = { propertyId, ...parsed.data };
  const properties = loadProperties();
  properties[propertyId] = property;
  saveProperties(properties);
  res.status(201).json(CreatePropertyResponse.parse(property));
});

router.get("/properties/:propertyId", (req, res): void => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const property = loadProperties()[params.data.propertyId];
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.json(GetPropertyResponse.parse(property));
});

router.patch("/properties/:propertyId", (req, res): void => {
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

  const properties = loadProperties();
  const existing = properties[params.data.propertyId];
  if (!existing) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  const updated = { ...existing, ...body.data };
  properties[params.data.propertyId] = updated;
  saveProperties(properties);
  res.json(UpdatePropertyResponse.parse(updated));
});

router.delete("/properties/:propertyId", (req, res): void => {
  const params = DeletePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const properties = loadProperties();
  if (!properties[params.data.propertyId]) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  delete properties[params.data.propertyId];
  saveProperties(properties);
  res.sendStatus(204);
});

router.post("/valuations/calculate", (req, res): void => {
  const body = CalculateValuationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = calculateValuation(body.data);
  writeJson("valuations.json", { last: { input: body.data, result } });
  res.json(CalculateValuationResponse.parse(result));
});

router.post("/rentals/overview", (req, res): void => {
  const body = CalculateRentalOverviewBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = calculateRental(body.data);
  writeJson("rentals.json", { last: { input: body.data, result } });
  res.json(CalculateRentalOverviewResponse.parse(result));
});

router.post("/mortgages/calculate", (req, res): void => {
  const body = CalculateMortgageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = calculateMortgage(body.data);
  writeJson("mortgages.json", { last: { input: body.data, result } });
  res.json(CalculateMortgageResponse.parse(result));
});

router.get("/market/trends", (_req, res): void => {
  const trend = readJson("market.json", {
    status: "ok",
    trend: "Stijgende markt in stedelijke gebieden",
    change: 3.7,
    period: "Q3 2026",
  });
  res.json(GetMarketTrendsResponse.parse(trend));
});

router.get("/dashboard/summary", (_req, res): void => {
  const summary = buildDashboardSummary(Object.values(loadProperties()));
  res.json(GetDashboardSummaryResponse.parse(summary));
});

export default router;