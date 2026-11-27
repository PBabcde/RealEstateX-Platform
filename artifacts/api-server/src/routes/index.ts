import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminAccessRouter from "./admin-access";
import publicCalculatorsRouter from "./public-calculators";
import { isAdminAccessSession } from "../lib/admin-access";
import realEstateRouter from "./realestatex";
import phase2Router from "./phase2";
import assistantChatRouter from "./assistant-chat";
import enterpriseCoreRouter from "./enterprise-core";
import accountRouter from "./account";
import dealsRouter from "./deals";
import investorsRouter from "./investors";
import crmRouter from "./crm";
import enterpriseRouter from "./enterprise";
import trainingRouter from "./training";
import intelligenceRouter from "./intelligence";
import { publicSalesRouter, salesRouter } from "./sales";
import propertyTransformationsRouter from "./property-transformations";
import energyxRouter from "./energyx";
import controlRoomRouter from "./control-room";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicSalesRouter);
router.use(adminAccessRouter);
router.use(publicCalculatorsRouter);
router.use(accountRouter);
// Legacy domain routers have router-wide auth guards. Dispatch only the
// explicitly allowed administrator surfaces before those guards.
router.use((req, res, next) => {
  if (!isAdminAccessSession(req)) { next(); return; }
  if (req.path === "/admin/control-room") { controlRoomRouter(req, res, next); return; }
  if (req.path.startsWith("/sales/")) { salesRouter(req, res, next); return; }
  if (req.path === "/crm/contacts" || req.path.startsWith("/crm/contacts/")) { crmRouter(req, res, next); return; }
  if (req.method === "GET" && req.path === "/visitor-intent/summary") { intelligenceRouter(req, res, next); return; }
  next();
});
router.use(realEstateRouter);
router.use(phase2Router);
router.use(assistantChatRouter);
router.use(enterpriseCoreRouter);
router.use(dealsRouter);
router.use(investorsRouter);
router.use(salesRouter);
router.use(crmRouter);
router.use(enterpriseRouter);
router.use(trainingRouter);
router.use(intelligenceRouter);
router.use(propertyTransformationsRouter);
router.use(energyxRouter);
router.use(controlRoomRouter);

export default router;
