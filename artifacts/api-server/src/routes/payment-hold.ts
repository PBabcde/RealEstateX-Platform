import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";

const router: IRouter = Router();

function paymentsOnHold(_req: Request, res: Response): void {
  res.status(410).json({
    code: "PAYMENTS_ON_HOLD",
    error: "RealEstateX Pro payments are paused while the product is in beta.",
  });
}

router.use("/saas/billing", (req, res, next: NextFunction): void => {
  if (req.method === "GET" && req.path === "/status") {
    next();
    return;
  }
  paymentsOnHold(req, res);
});

router.use("/stripe", paymentsOnHold);
router.use("/checkout", paymentsOnHold);
router.use("/billing", paymentsOnHold);

export default router;
