import { Router, type IRouter } from "express";
import healthRouter from "./health";
import realEstateRouter from "./realestatex";
import phase2Router from "./phase2";
import assistantChatRouter from "./assistant-chat";
import enterpriseCoreRouter from "./enterprise-core";
import authRouter from "./auth";
import dealsRouter from "./deals";
import investorsRouter from "./investors";
import crmRouter from "./crm";
import enterpriseRouter from "./enterprise";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(realEstateRouter);
router.use(phase2Router);
router.use(assistantChatRouter);
router.use(enterpriseCoreRouter);
router.use(dealsRouter);
router.use(investorsRouter);
router.use(crmRouter);
router.use(enterpriseRouter);

export default router;
