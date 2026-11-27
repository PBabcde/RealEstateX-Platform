import { Router, type IRouter } from "express";
import {
  CalculateMortgageBody,
  CalculateMortgageResponse,
  CalculateRentalOverviewBody,
  CalculateRentalOverviewResponse,
  CalculateValuationBody,
  CalculateValuationResponse,
} from "@workspace/api-zod";
import {
  calculateMortgage,
  calculateRental,
  calculateValuation,
} from "../lib/realestatex-modules";

const router: IRouter = Router();

// Public calculator responses are intentionally not persisted to an account.
router.post("/valuations/calculate", (req, res): void => {
  const body = CalculateValuationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  res.json(CalculateValuationResponse.parse(calculateValuation(body.data)));
});

router.post("/rentals/overview", (req, res): void => {
  const body = CalculateRentalOverviewBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  res.json(CalculateRentalOverviewResponse.parse(calculateRental(body.data)));
});

router.post("/mortgages/calculate", (req, res): void => {
  const body = CalculateMortgageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  res.json(CalculateMortgageResponse.parse(calculateMortgage(body.data)));
});

export default router;
