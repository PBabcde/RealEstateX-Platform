import { Router, type IRouter, type Request } from "express";
import {
  GetDailyMarketPulseResponse,
  GetDealMediaBriefParams,
  GetDealMediaBriefResponse,
  GetDealNeighborhoodSentimentParams,
  GetDealNeighborhoodSentimentResponse,
  GetDealSalesIntelligenceParams,
  GetDealSalesIntelligenceResponse,
  GetInvestorRecommendationsParams,
  GetInvestorRecommendationsResponse,
  GetVisitorIntentSummaryQueryParams,
  GetVisitorIntentSummaryResponse,
  RecordVisitorIntentEventBody,
  RecordVisitorIntentEventResponse,
  RefreshDealNeighborhoodSentimentParams,
  RefreshDealNeighborhoodSentimentResponse,
} from "@workspace/api-zod";
import {
  createId,
  deleteEntity,
  enrichDeal,
  getEntity,
  listEntities,
  saveEntity,
  type DealRecord,
  type InvestorRecord,
  type VisitorIntentEventRecord,
} from "../lib/enterprise-modules";
import {
  fetchNeighborhoodSentiment,
  type NeighborhoodSentimentSnapshot,
} from "../lib/sentiment-engine";
import {
  aggregateDealSalesActivity,
  aggregateVisitorIntent,
  type VisitorIntentEvent,
} from "../lib/visitor-intelligence";
import { matchInvestors } from "../lib/investor-matching";
import { attachEnterpriseContext } from "../lib/enterprise-core-access";
import { requireAuthentication } from "../middlewares/authorization";

const router: IRouter = Router();
router.use(requireAuthentication, attachEnterpriseContext);

const requestWindows = new Map<string, { startedAt: number; count: number }>();
const retentionPrunedAt = new Map<string, number>();
const EVENT_WINDOW_MS = 60_000;
const EVENT_LIMIT_PER_ACTOR = 60;
const VISITOR_RETENTION_DAYS = 90;

function context(request: Request) {
  if (!request.enterpriseContext) {
    throw new Error("Authenticated tenant context is missing.");
  }
  return request.enterpriseContext;
}

function allowEvent(tenantId: string, actorId: string): boolean {
  const now = Date.now();
  for (const [key, window] of requestWindows) {
    if (now - window.startedAt >= EVENT_WINDOW_MS) requestWindows.delete(key);
  }
  const key = `${tenantId}:${actorId}`;
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= EVENT_WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= EVENT_LIMIT_PER_ACTOR) return false;
  current.count += 1;
  return true;
}

async function pruneVisitorEvents(
  tenantId: string,
  actorId: string,
): Promise<VisitorIntentEventRecord[]> {
  const events = await listEntities<VisitorIntentEventRecord>(
    "visitor-intent-event",
    tenantId,
  );
  const now = Date.now();
  const lastPruned = retentionPrunedAt.get(tenantId) ?? 0;
  if (now - lastPruned >= 60 * 60 * 1000) {
    const cutoff = now - VISITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const expired = events.filter((event) => Date.parse(event.occurredAt) < cutoff);
    for (const event of expired) {
      await deleteEntity("visitor-intent-event", event.eventId, tenantId, actorId);
    }
    retentionPrunedAt.set(tenantId, now);
    return events.filter((event) => Date.parse(event.occurredAt) >= cutoff);
  }
  return events.filter(
    (event) => now - Date.parse(event.occurredAt) <= VISITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

router.post("/visitor-intent/events", async (request, response): Promise<void> => {
  const parsed = RecordVisitorIntentEventBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Ongeldig of niet-toegestaan intent-event." });
    return;
  }
  const tenant = context(request);
  const { visitorId, eventType, dealId, investorId } = parsed.data;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(visitorId)) {
    response.status(400).json({ error: "visitorId moet een pseudonieme sessie-ID zijn." });
    return;
  }
  if (!dealId) {
    response.status(400).json({ error: "Koppel het intent-event aan een deal." });
    return;
  }
  if (!allowEvent(tenant.tenantId, tenant.actorId)) {
    response.status(429).json({ error: "Maximaal 60 intent-events per minuut." });
    return;
  }
  const deal = await getEntity<DealRecord>("deal", dealId, tenant.tenantId);
  if (!deal) {
    response.status(404).json({ error: "Deal niet gevonden." });
    return;
  }
  if (investorId) {
    const investor = await getEntity<InvestorRecord>(
      "investor",
      investorId,
      tenant.tenantId,
    );
    if (!investor) {
      response.status(404).json({ error: "Investeerdersprofiel niet gevonden." });
      return;
    }
  }
  const occurredAt = new Date().toISOString();
  const event: VisitorIntentEventRecord = {
    eventId: createId(),
    visitorId,
    eventType,
    dealId,
    ...(investorId ? { investorId } : {}),
    occurredAt,
    consent: true,
    consentAt: occurredAt,
    actorId: tenant.actorId,
  };
  const saved = await saveEntity(
    "visitor-intent-event",
    event,
    tenant.tenantId,
    tenant.actorId,
    "created",
  );
  const { consentAt: _consentAt, actorId: _actorId, ...safeEvent } = saved;
  response.status(201).json(RecordVisitorIntentEventResponse.parse(safeEvent));
});

router.get("/visitor-intent/summary", async (request, response): Promise<void> => {
  const query = GetVisitorIntentSummaryQueryParams.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({ error: "days moet tussen 1 en 90 liggen." });
    return;
  }
  const tenant = context(request);
  const events = await pruneVisitorEvents(tenant.tenantId, tenant.actorId);
  const summary = aggregateVisitorIntent(
    events as VisitorIntentEvent[],
    { windowDays: query.data.days },
  );
  response.json(GetVisitorIntentSummaryResponse.parse(summary));
});

router.get("/deals/:dealId/sales-intelligence", async (request, response): Promise<void> => {
  const params = GetDealSalesIntelligenceParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Ongeldig deal-ID." });
    return;
  }
  const tenant = context(request);
  const deal = await getEntity<DealRecord>("deal", params.data.dealId, tenant.tenantId);
  if (!deal) {
    response.status(404).json({ error: "Deal niet gevonden." });
    return;
  }
  const events = await pruneVisitorEvents(tenant.tenantId, tenant.actorId);
  const activity = aggregateDealSalesActivity(
    deal.dealId,
    events as VisitorIntentEvent[],
  );
  response.json(GetDealSalesIntelligenceResponse.parse(activity));
});

router.get("/deals/:dealId/sentiment", async (request, response): Promise<void> => {
  const params = GetDealNeighborhoodSentimentParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Ongeldig deal-ID." });
    return;
  }
  const tenant = context(request);
  const deal = await getEntity<DealRecord>("deal", params.data.dealId, tenant.tenantId);
  if (!deal) {
    response.status(404).json({ error: "Deal niet gevonden." });
    return;
  }
  const snapshots = await listEntities<NeighborhoodSentimentSnapshot>(
    "neighborhood-sentiment",
    tenant.tenantId,
  );
  const latest = snapshots
    .filter((snapshot) => snapshot.region.toLocaleLowerCase() === deal.region.toLocaleLowerCase())
    .sort((left, right) => right.sampledAt.localeCompare(left.sampledAt))[0];
  if (!latest) {
    response.status(404).json({ error: "Er is nog geen nieuwsanalyse voor deze regio." });
    return;
  }
  response.json(GetDealNeighborhoodSentimentResponse.parse(latest));
});

router.post(
  "/deals/:dealId/sentiment/refresh",
  async (request, response): Promise<void> => {
    const params = RefreshDealNeighborhoodSentimentParams.safeParse(request.params);
    if (!params.success) {
      response.status(400).json({ error: "Ongeldig deal-ID." });
      return;
    }
    const tenant = context(request);
    const deal = await getEntity<DealRecord>("deal", params.data.dealId, tenant.tenantId);
    if (!deal) {
      response.status(404).json({ error: "Deal niet gevonden." });
      return;
    }
    try {
      const snapshots = await listEntities<NeighborhoodSentimentSnapshot>(
        "neighborhood-sentiment",
        tenant.tenantId,
      );
      const previous = snapshots
        .filter((snapshot) => snapshot.region.toLocaleLowerCase() === deal.region.toLocaleLowerCase())
        .sort((left, right) => right.sampledAt.localeCompare(left.sampledAt))[0];
      const sentiment = await fetchNeighborhoodSentiment(deal.region, { previous });
      const updatedDeal = enrichDeal({
        ...deal,
        gutFeeling: {
          score: sentiment.gutFeelingScore,
          confidence: sentiment.confidence,
          summary: sentiment.narrativeSummary,
          sourceCount: sentiment.articleCount,
          region: sentiment.region,
          observedAt: sentiment.sampledAt,
          staleAt: sentiment.staleAt,
        },
        updatedAt: new Date().toISOString(),
      }).deal;
      await saveEntity(
        "neighborhood-sentiment",
        sentiment,
        tenant.tenantId,
        tenant.actorId,
        "created",
      );
      await saveEntity("deal", updatedDeal, tenant.tenantId, tenant.actorId, "updated");
      response.json(RefreshDealNeighborhoodSentimentResponse.parse(sentiment));
    } catch (error) {
      request.log.warn(
        { error: error instanceof Error ? error.message : "unknown" },
        "Neighborhood sentiment refresh failed",
      );
      response.status(502).json({ error: "Nieuwsbron is tijdelijk niet beschikbaar." });
    }
  },
);

router.get("/deals/:dealId/media-brief", async (request, response): Promise<void> => {
  const params = GetDealMediaBriefParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Ongeldig deal-ID." });
    return;
  }
  const tenant = context(request);
  const deal = await getEntity<DealRecord>("deal", params.data.dealId, tenant.tenantId);
  if (!deal) {
    response.status(404).json({ error: "Deal niet gevonden." });
    return;
  }
  const contextLine = `${deal.propertyType} in ${deal.region}, ${deal.woonoppervlak} m², energielabel ${deal.energyLabel}.`;
  const brief = {
    dealId: deal.dealId,
    beforePrompt: `Fotorealistische voor-situatie van een Nederlandse ${contextLine} Huidige staat behouden, natuurlijk daglicht, architectuurgetrouw, geen tekst.`,
    afterPrompt: `Fotorealistische renovatie-na-situatie van dezelfde Nederlandse ${contextLine} Hoogwaardige duurzame afwerking, geloofwaardige materialen en behoud van de oorspronkelijke architectuur, geen tekst.`,
    videoLoopPrompt: `Naadloze 6-seconden vastgoedloop van dezelfde ${contextLine} Langzame gestabiliseerde camerabeweging, subtiele lichtverandering en een geloofwaardige overgang van huidige naar gerenoveerde staat.`,
    integrationStatus: "NOT_CONFIGURED" as const,
    generatedAt: new Date().toISOString(),
  };
  response.json(GetDealMediaBriefResponse.parse(brief));
});

router.get(
  "/market-pulse/daily",
  async (request, response): Promise<void> => {
    const tenant = context(request);
    const [deals, investors] = await Promise.all([
      listEntities<DealRecord>("deal", tenant.tenantId),
      listEntities<InvestorRecord>("investor", tenant.tenantId),
    ]);
    const ranked = deals
      .map((deal) => {
        const enriched = enrichDeal(deal);
        const matches = matchInvestors(enriched.deal, investors);
        return {
          deal: enriched.deal,
          netRoi: enriched.netRoi.netRoi,
          investorMatchCount: matches.filter((match) => match.matchScore >= 60).length,
        };
      })
      .filter(({ netRoi, deal }) => netRoi > 0 && deal.score.decision !== "REJECT")
      .sort(
        (left, right) =>
          right.netRoi - left.netRoi ||
          right.deal.score.totalScore - left.deal.score.totalScore ||
          left.deal.dealId.localeCompare(right.deal.dealId),
      );
    const items = ranked.slice(0, 3).map(({ deal, netRoi, investorMatchCount }, index) => ({
      rank: index + 1,
      dealId: deal.dealId,
      title: deal.title,
      region: deal.region,
      netRoi,
      totalScore: deal.score.totalScore,
      decision: deal.score.decision,
      investorMatchCount,
      explanation: `${netRoi.toFixed(1)}% netto ROI · score ${deal.score.totalScore}/100 · ${investorMatchCount} passende investeerders.`,
    }));
    response.json(
      GetDailyMarketPulseResponse.parse({
        generatedAt: new Date().toISOString(),
        ranking: "netRoi-desc-score-desc",
        availableDealsCount: ranked.length,
        items,
      }),
    );
  },
);

router.get(
  "/investors/:investorId/recommendations",
  async (request, response): Promise<void> => {
    const params = GetInvestorRecommendationsParams.safeParse(request.params);
    if (!params.success) {
      response.status(400).json({ error: "Ongeldig investeerders-ID." });
      return;
    }
    const tenant = context(request);
    const investor = await getEntity<InvestorRecord>(
      "investor",
      params.data.investorId,
      tenant.tenantId,
    );
    if (!investor) {
      response.status(404).json({ error: "Investeerdersprofiel niet gevonden." });
      return;
    }
    const deals = await listEntities<DealRecord>("deal", tenant.tenantId);
    const recommendations = deals
      .map((deal) => {
        const enriched = enrichDeal(deal).deal;
        const match = matchInvestors(enriched, [investor])[0];
        if (!match) return undefined;
        return {
          dealId: enriched.dealId,
          title: enriched.title,
          region: enriched.region,
          askingPrice: enriched.askingPrice,
          expectedValue: enriched.expectedValue,
          totalScore: enriched.score.totalScore,
          matchScore: match.matchScore,
          reasons: match.reasons,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort(
        (left, right) =>
          right.matchScore - left.matchScore ||
          right.totalScore - left.totalScore ||
          left.dealId.localeCompare(right.dealId),
      )
      .slice(0, 3);
    const firstName = investor.name.trim().split(/\s+/)[0] || investor.name;
    response.json(
      GetInvestorRecommendationsResponse.parse({
        greeting: `Welkom terug, ${firstName}. Deze kansen passen bij je ${investor.riskProfile.toLowerCase()}-risicoprofiel.`,
        investor,
        recommendations,
      }),
    );
  },
);

export default router;