import { Router, type IRouter } from "express";
import healthRouter from "./health";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicSalesRouter);
router.use(accountRouter);
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

export default router;
