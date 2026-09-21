import { Router, type IRouter } from "express";
import healthRouter from "./health";
import realEstateRouter from "./realestatex";

const router: IRouter = Router();

router.use(healthRouter);
router.use(realEstateRouter);

export default router;
