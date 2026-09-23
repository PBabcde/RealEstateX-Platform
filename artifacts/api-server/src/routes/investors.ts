import { Router, type IRouter } from "express";
import { attachEnterpriseContext } from "../lib/enterprise-core-access";
import {
  createId,
  deleteEntity,
  getEntity,
  listEntities,
  saveEntity,
  type InvestorRecord,
} from "../lib/enterprise-modules";
import { requireAuthentication } from "../middlewares/authorization";

const router: IRouter = Router();
router.use(requireAuthentication, attachEnterpriseContext);

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function money(value: unknown, field: string, fallback = 0): number {
  const parsed = value == null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be non-negative.`);
  return parsed;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function parseInvestor(
  body: Record<string, unknown>,
  actorId: string,
  existing?: InvestorRecord,
): InvestorRecord {
  const now = new Date().toISOString();
  const riskProfile = body.riskProfile ?? existing?.riskProfile ?? "MEDIUM";
  if (riskProfile !== "LOW" && riskProfile !== "MEDIUM" && riskProfile !== "HIGH") {
    throw new Error("riskProfile must be LOW, MEDIUM or HIGH.");
  }
  return {
    investorId: existing?.investorId ?? createId(),
    name: requiredString(body.name ?? existing?.name, "name"),
    email: requiredString(body.email ?? existing?.email, "email"),
    ...(typeof (body.company ?? existing?.company) === "string"
      ? { company: String(body.company ?? existing?.company).trim() }
      : {}),
    riskProfile,
    budgetMin: money(body.budgetMin ?? existing?.budgetMin, "budgetMin"),
    budgetMax: money(body.budgetMax ?? existing?.budgetMax, "budgetMax"),
    preferredRegions: strings(body.preferredRegions ?? existing?.preferredRegions),
    interests: strings(body.interests ?? existing?.interests),
    ownerId: existing?.ownerId ?? actorId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

router.get("/investors", async (req, res, next): Promise<void> => {
  try {
    res.json(await listEntities<InvestorRecord>("investor", req.enterpriseContext!.tenantId));
  } catch (error) {
    next(error);
  }
});

router.post("/investors", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    const investor = parseInvestor(req.body as Record<string, unknown>, context.actorId);
    if (investor.budgetMax < investor.budgetMin) {
      res.status(400).json({ error: "budgetMax must be greater than or equal to budgetMin." });
      return;
    }
    res.status(201).json(
      await saveEntity("investor", investor, context.tenantId, context.actorId, "created"),
    );
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get("/investors/:investorId", async (req, res, next): Promise<void> => {
  try {
    const investor = await getEntity<InvestorRecord>(
      "investor",
      req.params.investorId,
      req.enterpriseContext!.tenantId,
    );
    if (!investor) {
      res.status(404).json({ error: "Investor not found" });
      return;
    }
    res.json(investor);
  } catch (error) {
    next(error);
  }
});

router.patch("/investors/:investorId", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    const existing = await getEntity<InvestorRecord>("investor", req.params.investorId, context.tenantId);
    if (!existing) {
      res.status(404).json({ error: "Investor not found" });
      return;
    }
    const investor = parseInvestor(req.body as Record<string, unknown>, context.actorId, existing);
    if (investor.budgetMax < investor.budgetMin) {
      res.status(400).json({ error: "budgetMax must be greater than or equal to budgetMin." });
      return;
    }
    res.json(await saveEntity("investor", investor, context.tenantId, context.actorId, "updated"));
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.delete("/investors/:investorId", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    if (!(await deleteEntity("investor", req.params.investorId, context.tenantId, context.actorId))) {
      res.status(404).json({ error: "Investor not found" });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

export default router;