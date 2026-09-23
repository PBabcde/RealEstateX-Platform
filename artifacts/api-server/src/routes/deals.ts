import { Router, type IRouter, type Request } from "express";
import { getProperty, initialiseRealEstateStorage } from "../lib/realestatex-storage";
import { canAccessOwner, forbidden, requireAuthentication } from "../middlewares/authorization";
import { attachEnterpriseContext } from "../lib/enterprise-core-access";
import {
  createId,
  deleteEntity,
  enrichDeal,
  getEntity,
  listEntities,
  saveEntity,
  type DealRecord,
} from "../lib/enterprise-modules";
import { calculateDealScore } from "../lib/deal-score";
import { analyseEnergy } from "../lib/energy-analysis";
import { calculateSubsidies, calculateNetRoi } from "../lib/subsidy-engine";
import { createInvestorReadySheet } from "../lib/investor-ready-sheet";
import { matchInvestors } from "../lib/investor-matching";
import { type InvestorRecord } from "../lib/enterprise-modules";

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

function numberField(value: unknown, field: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${field} must be a number greater than or equal to ${minimum}.`);
  }
  return parsed;
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

async function parseDeal(
  body: Record<string, unknown>,
  request: Request,
  actorId: string,
  existing?: DealRecord,
): Promise<DealRecord> {
  const propertyId = stringField(body.propertyId ?? existing?.propertyId, "propertyId");
  const property = await getProperty(propertyId);
  if (!property || !canAccessOwner(request, property.ownerId)) {
    throw new Error("Property not found or not accessible.");
  }
  const askingPrice = numberField(body.askingPrice ?? existing?.askingPrice, "askingPrice", 1);
  const renovationCost = numberField(
    body.renovationCost ?? existing?.renovationCost ?? 0,
    "renovationCost",
  );
  const expectedValue = numberField(
    body.expectedValue ?? existing?.expectedValue ?? askingPrice,
    "expectedValue",
    1,
  );
  const monthlyRent = numberField(
    body.monthlyRent ?? existing?.monthlyRent ?? 0,
    "monthlyRent",
  );
  const now = new Date().toISOString();
  const deal: DealRecord = {
    dealId: existing?.dealId ?? createId(),
    propertyId,
    title: stringField(body.title ?? existing?.title ?? property.adres, "title"),
    region: stringField(body.region ?? existing?.region ?? property.adres, "region"),
    propertyType: property.type,
    energyLabel: property.energielabel,
    woonoppervlak: property.woonoppervlak,
    askingPrice,
    renovationCost,
    expectedValue,
    monthlyRent,
    ...(typeof (body.municipality ?? existing?.municipality) === "string"
      ? { municipality: String(body.municipality ?? existing?.municipality).trim() }
      : {}),
    status: existing?.status ?? "DRAFT",
    ownerId: existing?.ownerId ?? actorId,
    score:
      existing?.score ??
      calculateDealScore({
        askingPrice,
        renovationCost,
        expectedValue,
        monthlyRent,
        energyScore: 50,
        subsidyAmount: 0,
      }),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return enrichDeal(deal).deal;
}

router.get("/deals", async (req, res, next): Promise<void> => {
  try {
    res.json(await listEntities<DealRecord>("deal", req.enterpriseContext!.tenantId));
  } catch (error) {
    next(error);
  }
});

router.post("/deals", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    const deal = await parseDeal(req.body as Record<string, unknown>, req, context.actorId);
    res.status(201).json(
      await saveEntity("deal", deal, context.tenantId, context.actorId, "created"),
    );
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get("/deals/:dealId", async (req, res, next): Promise<void> => {
  try {
    const deal = await getEntity<DealRecord>(
      "deal",
      req.params.dealId,
      req.enterpriseContext!.tenantId,
    );
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    res.json(enrichDeal(deal));
  } catch (error) {
    next(error);
  }
});

router.patch("/deals/:dealId", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    const existing = await getEntity<DealRecord>("deal", req.params.dealId, context.tenantId);
    if (!existing) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    const deal = await parseDeal(req.body as Record<string, unknown>, req, context.actorId, existing);
    res.json(await saveEntity("deal", deal, context.tenantId, context.actorId, "updated"));
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.delete("/deals/:dealId", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    if (!(await deleteEntity("deal", req.params.dealId, context.tenantId, context.actorId))) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

router.post("/deals/:dealId/score", async (req, res, next): Promise<void> => {
  try {
    const deal = await getEntity<DealRecord>("deal", req.params.dealId, req.enterpriseContext!.tenantId);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    res.json(enrichDeal(deal).deal.score);
  } catch (error) {
    next(error);
  }
});

router.get("/deals/:dealId/energy", async (req, res, next): Promise<void> => {
  try {
    const deal = await getEntity<DealRecord>("deal", req.params.dealId, req.enterpriseContext!.tenantId);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    const enriched = enrichDeal(deal);
    res.json({
      energy: enriched.energy,
      subsidies: enriched.subsidies,
      netRoi: enriched.netRoi,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/deals/:dealId/matches", async (req, res, next): Promise<void> => {
  try {
    const tenantId = req.enterpriseContext!.tenantId;
    const deal = await getEntity<DealRecord>("deal", req.params.dealId, tenantId);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    const investors = await listEntities<InvestorRecord>("investor", tenantId);
    res.json(matchInvestors(enrichDeal(deal).deal, investors));
  } catch (error) {
    next(error);
  }
});

router.get("/deals/:dealId/investor-ready-sheet", async (req, res, next): Promise<void> => {
  try {
    const deal = await getEntity<DealRecord>("deal", req.params.dealId, req.enterpriseContext!.tenantId);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    const enriched = enrichDeal(deal);
    const pdf = createInvestorReadySheet({
      deal: enriched.deal,
      energy: enriched.energy,
      subsidies: enriched.subsidies.triggers,
    });
    res
      .type("application/pdf")
      .setHeader("Content-Disposition", `attachment; filename="${deal.dealId}-investor-ready-sheet.pdf"`)
      .send(pdf);
  } catch (error) {
    next(error);
  }
});

export default router;