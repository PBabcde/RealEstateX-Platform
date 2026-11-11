import { Router, type IRouter } from "express";
import { attachEnterpriseContext } from "../lib/enterprise-core-access";
import { enrichDeal, listEntities, type CrmContactRecord, type DealRecord, type InvestorRecord } from "../lib/enterprise-modules";
import { getSaaSEntitlements, SAAS_TIERS, type SaaSTier } from "../lib/saas-entitlements";
import { getBillingReadiness } from "../lib/billing-hooks";
import { requireAuthentication } from "../middlewares/authorization";

const router: IRouter = Router();
router.use(requireAuthentication, attachEnterpriseContext);

router.get("/enterprise/overview", async (req, res, next): Promise<void> => {
  try {
    const tenantId = req.enterpriseContext!.tenantId;
    const [deals, investors, contacts] = await Promise.all([
      listEntities<DealRecord>("deal", tenantId).then(items => items.map(item => enrichDeal(item).deal)),
      listEntities<InvestorRecord>("investor", tenantId),
      listEntities<CrmContactRecord>("crm-contact", tenantId),
    ]);
    res.json({
      status: "online",
      tenantId,
      counts: {
        deals: deals.length,
        investors: investors.length,
        crmContacts: contacts.length,
      },
      goDeals: deals.filter((deal) => deal.score.decision === "GO").length,
      averageDealScore: deals.length
        ? Math.round(deals.reduce((sum, deal) => sum + deal.score.totalScore, 0) / deals.length)
        : 0,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/saas/entitlements", (req, res): void => {
  const requested = String(req.query.tier ?? process.env.SAAS_DEFAULT_TIER ?? "PROFESSIONAL").toUpperCase();
  const tier: SaaSTier = requested in SAAS_TIERS ? (requested as SaaSTier) : "PROFESSIONAL";
  res.json(getSaaSEntitlements(tier));
});

router.get("/saas/billing/status", (_req, res): void => {
  res.json(getBillingReadiness());
});

export default router;