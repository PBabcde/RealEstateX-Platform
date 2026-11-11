import { Router, type IRouter, type Request } from "express";
import {
  TrainingCreateScenarioBody,
  TrainingCreateScenarioResponse,
  TrainingDownloadInvestorReadySheetParams,
  TrainingGetScenarioParams,
  TrainingGetScenarioResponse,
  TrainingPromoteScenarioParams,
  TrainingPromoteScenarioResponse,
  TrainingRefreshScenarioSentimentParams,
  TrainingRefreshScenarioSentimentResponse,
  TrainingUpdateScenarioBody,
  TrainingUpdateScenarioParams,
  TrainingUpdateScenarioResponse,
} from "@workspace/api-zod";
import { getProperty, initialiseRealEstateStorage } from "../lib/realestatex-storage";
import { attachEnterpriseContext } from "../lib/enterprise-core-access";
import {
  createId,
  enrichDeal,
  getEntity,
  listEntities,
  saveEntity,
  type DealRecord,
  type TrainingScenarioRecord,
} from "../lib/enterprise-modules";
import { calculateDealScore } from "../lib/deal-score";
import { fetchNeighborhoodSentiment } from "../lib/sentiment-engine";
import { hasTrainingQualityGatePassed } from "../lib/training-quality-gate";
import { createInvestorReadySheet } from "../lib/investor-ready-sheet";
import { canAccessOwner, requireAuthentication } from "../middlewares/authorization";

const router: IRouter = Router();
router.use(requireAuthentication, attachEnterpriseContext);
router.use(async (_req, _res, next): Promise<void> => {
  try {
    await initialiseRealEstateStorage();
    next();
  } catch (error) {
    next(error);
  }
});

function context(request: Request) {
  if (!request.enterpriseContext) {
    throw new Error("Authenticated tenant context is missing.");
  }
  return request.enterpriseContext;
}

function scoreScenario(scenario: TrainingScenarioRecord): TrainingScenarioRecord {
  const gutFeeling = scenario.gutFeeling
    ? {
        score: scenario.gutFeeling.gutFeelingScore,
        confidence: scenario.gutFeeling.confidence,
        summary: scenario.gutFeeling.narrativeSummary,
        sourceCount: scenario.gutFeeling.articleCount,
        region: scenario.gutFeeling.region,
        observedAt: scenario.gutFeeling.sampledAt,
        staleAt: scenario.gutFeeling.staleAt,
      }
    : undefined;
  const draft: DealRecord = {
    investmentAssumptions: scenario.investmentAssumptions,
    dealId: `training-${scenario.scenarioId}`,
    propertyId: scenario.propertyId,
    title: scenario.title,
    region: scenario.region,
    propertyType: scenario.propertyType,
    energyLabel: scenario.energyLabel,
    woonoppervlak: scenario.woonoppervlak,
    askingPrice: scenario.askingPrice,
    renovationCost: scenario.renovationCost,
    expectedValue: scenario.expectedValue,
    monthlyRent: scenario.monthlyRent,
    ...(scenario.municipality ? { municipality: scenario.municipality } : {}),
    status: "DRAFT",
    ownerId: scenario.ownerId,
    score: calculateDealScore({
      askingPrice: scenario.askingPrice,
      renovationCost: scenario.renovationCost,
      expectedValue: scenario.expectedValue,
      monthlyRent: scenario.monthlyRent,
      energyScore: 50,
      subsidyAmount: 0,
    }),
    ...(gutFeeling ? { gutFeeling } : {}),
    createdAt: scenario.createdAt,
    updatedAt: scenario.updatedAt,
  };
  const score = enrichDeal(draft).deal.score;
  const qualityGatePassed = hasTrainingQualityGatePassed(score.totalScore) && score.assessment?.eligible === true;
  return {
    ...scenario,
    ...(scenario.gutFeeling ? { gutFeeling: scenario.gutFeeling } : {}),
    score,
    qualityGatePassed,
    status: scenario.promotedDealId
      ? "PROMOTED"
      : qualityGatePassed
        ? "READY"
        : "DRAFT",
  };
}

function scenarioAsDeal(
  scenario: TrainingScenarioRecord,
  dealId = `training-${scenario.scenarioId}`,
): DealRecord {
  const gutFeeling = scenario.gutFeeling
    ? {
        score: scenario.gutFeeling.gutFeelingScore,
        confidence: scenario.gutFeeling.confidence,
        summary: scenario.gutFeeling.narrativeSummary,
        sourceCount: scenario.gutFeeling.articleCount,
        region: scenario.gutFeeling.region,
        observedAt: scenario.gutFeeling.sampledAt,
        staleAt: scenario.gutFeeling.staleAt,
      }
    : undefined;
  return enrichDeal({
    investmentAssumptions: scenario.investmentAssumptions,
    dealId,
    propertyId: scenario.propertyId,
    title: scenario.title,
    region: scenario.region,
    propertyType: scenario.propertyType,
    energyLabel: scenario.energyLabel,
    woonoppervlak: scenario.woonoppervlak,
    askingPrice: scenario.askingPrice,
    renovationCost: scenario.renovationCost,
    expectedValue: scenario.expectedValue,
    monthlyRent: scenario.monthlyRent,
    ...(scenario.municipality ? { municipality: scenario.municipality } : {}),
    status: scenario.score.decision,
    ownerId: scenario.ownerId,
    score: scenario.score,
    ...(gutFeeling ? { gutFeeling } : {}),
    createdAt: scenario.createdAt,
    updatedAt: scenario.updatedAt,
  }).deal;
}

router.get("/training/scenarios", async (request, response): Promise<void> => {
  const { tenantId } = context(request);
  const scenarios = await listEntities<TrainingScenarioRecord>(
    "training-scenario",
    tenantId,
  );
  response.json(scenarios.map(scoreScenario).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
});

router.post("/training/scenarios", async (request, response): Promise<void> => {
  const parsed = TrainingCreateScenarioBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Ongeldige simulatiegegevens." });
    return;
  }
  const tenant = context(request);
  const property = await getProperty(parsed.data.propertyId);
  if (!property || !canAccessOwner(request, property.ownerId)) {
    response.status(404).json({ error: "Object niet gevonden of niet toegankelijk." });
    return;
  }
  const now = new Date().toISOString();
  const scenario = scoreScenario({
    investmentAssumptions: parsed.data.investmentAssumptions,
    scenarioId: createId(),
    propertyId: property.propertyId,
    title: parsed.data.title.trim(),
    region: parsed.data.region.trim(),
    propertyType: property.type,
    energyLabel: property.energielabel,
    woonoppervlak: property.woonoppervlak,
    askingPrice: parsed.data.askingPrice,
    renovationCost: parsed.data.renovationCost ?? 0,
    expectedValue: parsed.data.expectedValue,
    monthlyRent: parsed.data.monthlyRent ?? 0,
    ...(parsed.data.municipality?.trim()
      ? { municipality: parsed.data.municipality.trim() }
      : {}),
    status: "DRAFT",
    qualityGatePassed: false,
    score: calculateDealScore({
      askingPrice: parsed.data.askingPrice,
      renovationCost: parsed.data.renovationCost ?? 0,
      expectedValue: parsed.data.expectedValue,
      monthlyRent: parsed.data.monthlyRent ?? 0,
      energyScore: 50,
      subsidyAmount: 0,
    }),
    promotedDealId: null,
    ownerId: tenant.actorId,
    createdAt: now,
    updatedAt: now,
  });
  const saved = await saveEntity(
    "training-scenario",
    scenario,
    tenant.tenantId,
    tenant.actorId,
    "created",
  );
  response.status(201).json(TrainingCreateScenarioResponse.parse(saved));
});

router.get(
  "/training/scenarios/:scenarioId",
  async (request, response): Promise<void> => {
    const params = TrainingGetScenarioParams.safeParse(request.params);
    if (!params.success) {
      response.status(400).json({ error: "Ongeldig simulatie-ID." });
      return;
    }
    const scenario = await getEntity<TrainingScenarioRecord>(
      "training-scenario",
      params.data.scenarioId,
      context(request).tenantId,
    );
    if (!scenario) {
      response.status(404).json({ error: "Simulatie niet gevonden." });
      return;
    }
    response.json(TrainingGetScenarioResponse.parse(scoreScenario(scenario)));
  },
);

router.patch(
  "/training/scenarios/:scenarioId",
  async (request, response): Promise<void> => {
    const params = TrainingUpdateScenarioParams.safeParse(request.params);
    const parsed = TrainingUpdateScenarioBody.safeParse(request.body);
    if (!params.success || !parsed.success) {
      response.status(400).json({ error: "Ongeldige simulatiegegevens." });
      return;
    }
    const tenant = context(request);
    const existing = await getEntity<TrainingScenarioRecord>(
      "training-scenario",
      params.data.scenarioId,
      tenant.tenantId,
    );
    if (!existing) {
      response.status(404).json({ error: "Simulatie niet gevonden." });
      return;
    }
    if (existing.status === "PROMOTED") {
      response.status(409).json({ error: "Een gepubliceerde simulatie kan niet meer worden aangepast." });
      return;
    }
    const scenario = scoreScenario({
      ...existing,
      ...parsed.data,
      ...(typeof parsed.data.title === "string"
        ? { title: parsed.data.title.trim() }
        : {}),
      ...(typeof parsed.data.region === "string"
        ? { region: parsed.data.region.trim() }
        : {}),
      updatedAt: new Date().toISOString(),
    });
    const saved = await saveEntity(
      "training-scenario",
      scenario,
      tenant.tenantId,
      tenant.actorId,
      "updated",
    );
    response.json(TrainingUpdateScenarioResponse.parse(saved));
  },
);

router.post(
  "/training/scenarios/:scenarioId/promote",
  async (request, response): Promise<void> => {
    const params = TrainingPromoteScenarioParams.safeParse(request.params);
    if (!params.success) {
      response.status(400).json({ error: "Ongeldig simulatie-ID." });
      return;
    }
    const tenant = context(request);
    const scenario = await getEntity<TrainingScenarioRecord>(
      "training-scenario",
      params.data.scenarioId,
      tenant.tenantId,
    );
    if (!scenario) {
      response.status(404).json({ error: "Simulatie niet gevonden." });
      return;
    }
    const current = scoreScenario(scenario);
    if (!current.qualityGatePassed) {
      response.status(403).json({
        error: `Quality Gate vereist minimaal 80 punten én de investeringstoets. Score: ${current.score.totalScore}. ${(current.score.assessment?.reasons ?? []).join(" ")}`,
      });
      return;
    }
    const dealId = scenario.promotedDealId ?? `training-${scenario.scenarioId}`;
    let deal = await getEntity<DealRecord>("deal", dealId, tenant.tenantId);
    if (scenario.promotedDealId && !deal) {
      response.status(409).json({ error: "De gepubliceerde deal ontbreekt; promotie is gestopt." });
      return;
    }
    if (!deal) {
      deal = scenarioAsDeal(current, dealId);
      await saveEntity("deal", deal, tenant.tenantId, tenant.actorId, "created");
    }
    const updatedScenario: TrainingScenarioRecord = {
      ...current,
      status: "PROMOTED",
      qualityGatePassed: true,
      promotedDealId: dealId,
      updatedAt: new Date().toISOString(),
    };
    const savedScenario = await saveEntity(
      "training-scenario",
      updatedScenario,
      tenant.tenantId,
      tenant.actorId,
      scenario.promotedDealId ? "updated" : "updated",
    );
    response.json(
      TrainingPromoteScenarioResponse.parse({
        scenario: savedScenario,
        deal,
        investorReadySheetUrl: `/api/training/scenarios/${encodeURIComponent(scenario.scenarioId)}/investor-ready-sheet`,
      }),
    );
  },
);

router.get(
  "/training/scenarios/:scenarioId/investor-ready-sheet",
  async (request, response): Promise<void> => {
    const params = TrainingDownloadInvestorReadySheetParams.safeParse(request.params);
    if (!params.success) {
      response.status(400).json({ error: "Ongeldig simulatie-ID." });
      return;
    }
    const tenant = context(request);
    const scenario = await getEntity<TrainingScenarioRecord>(
      "training-scenario",
      params.data.scenarioId,
      tenant.tenantId,
    );
    if (!scenario) {
      response.status(404).json({ error: "Simulatie niet gevonden." });
      return;
    }
    if (scenario.status !== "PROMOTED" || !scenario.promotedDealId) {
      response.status(403).json({ error: "Promoot de simulatie eerst via de Quality Gate." });
      return;
    }
    const deal = await getEntity<DealRecord>(
      "deal",
      scenario.promotedDealId,
      tenant.tenantId,
    );
    if (!deal) {
      response.status(404).json({ error: "Gepubliceerde deal niet gevonden." });
      return;
    }
    const { deal: enriched, energy, subsidies } = enrichDeal(deal);
    const pdf = createInvestorReadySheet({
      deal: enriched,
      energy,
      subsidies: subsidies.triggers,
    });
    response
      .status(200)
      .type("application/pdf")
      .set("Content-Disposition", `attachment; filename="${scenario.scenarioId}-investor-ready-sheet.pdf"`)
      .send(pdf);
  },
);

router.post(
  "/training/scenarios/:scenarioId/sentiment/refresh",
  async (request, response): Promise<void> => {
    const params = TrainingRefreshScenarioSentimentParams.safeParse(request.params);
    if (!params.success) {
      response.status(400).json({ error: "Ongeldig simulatie-ID." });
      return;
    }
    const tenant = context(request);
    const existing = await getEntity<TrainingScenarioRecord>(
      "training-scenario",
      params.data.scenarioId,
      tenant.tenantId,
    );
    if (!existing) {
      response.status(404).json({ error: "Simulatie niet gevonden." });
      return;
    }
    if (existing.status === "PROMOTED") {
      response.status(409).json({ error: "Werk de sentimentanalyse bij op de gepubliceerde deal." });
      return;
    }
    try {
      const sentiment = await fetchNeighborhoodSentiment(existing.region, {
        previous: existing.gutFeeling,
      });
      const scenario = scoreScenario({
        ...existing,
        gutFeeling: sentiment,
        updatedAt: new Date().toISOString(),
      });
      await saveEntity(
        "neighborhood-sentiment",
        sentiment,
        tenant.tenantId,
        tenant.actorId,
        "created",
      );
      const saved = await saveEntity(
        "training-scenario",
        scenario,
        tenant.tenantId,
        tenant.actorId,
        "updated",
      );
      response.json(
        TrainingRefreshScenarioSentimentResponse.parse({ scenario: saved, sentiment }),
      );
    } catch (error) {
      request.log.warn(
        { error: error instanceof Error ? error.message : "unknown" },
        "Neighborhood sentiment refresh failed",
      );
      response.status(502).json({ error: "Nieuwsbron is tijdelijk niet beschikbaar." });
    }
  },
);

export default router;