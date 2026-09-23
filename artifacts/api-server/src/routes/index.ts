import { Router, type IRouter } from "express";
import healthRouter from "./health";
import realEstateRouter from "./realestatex";
import phase2Router from "./phase2";
import assistantChatRouter from "./assistant-chat";
import enterpriseCoreRouter from "./enterprise-core";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(realEstateRouter);
router.use(phase2Router);
router.use(assistantChatRouter);
router.use(enterpriseCoreRouter);

export default router;
