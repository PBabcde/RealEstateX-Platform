import { Router, type IRouter } from "express";
import { GetSuiteOverviewResponse } from "@workspace/api-zod";
import {
  initialiseRealEstateStorage,
  readModuleData,
} from "../lib/realestatex-storage";
import { requireAuthentication } from "../middlewares/authorization";
import { attachEnterpriseContext } from "../lib/enterprise-core-access";

const router: IRouter = Router();
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

const suiteModules = [
  ["CoreX", "Orchestration", "Router registry, event bus and audit logging"],
  ["AssistantX", "Intelligence", "Real-estate guidance connected to RAG"],
  ["ChatBoxX", "Experience", "Persisted chat sessions and assistant replies"],
  ["DIYX", "Planning", "Splitting, transformation, renovation and green plans"],
  ["SubsidiesX", "Sustainability", "Regional energy and renovation subsidy scan"],
  ["DealScoreX", "Deals", "0–100 deal, chance and risk scoring"],
  ["DealEngineX", "Deals", "Go, hold or reject decision support"],
  ["DealStructX", "Finance", "Private, BV, holding and investor pool advice"],
  ["DealFinanceX", "Finance", "Cashflow, IRR and ROI simulator"],
  ["FinanceHubX", "Finance", "Mortgage, bank and investor loan overview"],
  ["InvestorHubX", "Network", "Investor profiles and deal matching"],
  ["MarketplaceX", "Marketplace", "Top viewed and interesting supply"],
  ["AnalyticsX", "Insights", "Visitors, deals, leads and conversion"],
  ["RiskX", "Risk", "Market, interest, vacancy and transformation risk"],
  ["PortfolioX", "Portfolio", "Property value growth, cashflow and return"],
  ["TenantX", "Operations", "Tenants, payments, contracts and maintenance"],
  ["GreenX", "Sustainability", "CO2, energy labels and savings"],
  ["CommunityX", "Community", "Groups, discussions and knowledge sharing"],
  ["VisitorsX", "Insights", "Visits, sessions, sources and behaviour"],
  ["RAGSuperEngineX", "Intelligence", "Document extraction for deals and portfolio"],
] as const;

  router.get("/suite/overview", async (req, res): Promise<void> => {
  const core = await readModuleData(
    "coreX.json",
    { modules: [], services: [] },
    req.enterpriseContext!.tenantId,
  );
  const modules = suiteModules.map(([name, category, capability]) => ({
    name,
    category,
    capability,
    status: "online",
  }));
  res.json(
    GetSuiteOverviewResponse.parse({
      status: "online",
      connectedModules: modules.length,
      activeServices: core.services?.length || modules.length,
      moduleCount: modules.length,
      modules,
      lastUpdated: new Date().toISOString(),
    }),
  );
});

export default router;