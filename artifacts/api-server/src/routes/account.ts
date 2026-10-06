import { Router } from "express";
import { GetAccountResponse } from "@workspace/api-zod";
import { requireAuthentication } from "../middlewares/authorization";

const router = Router();
router.get("/account", requireAuthentication, (req, res): void => {
  res.json(GetAccountResponse.parse({
    id: req.dbUser!.id,
    role: req.dbUser!.role,
    tenantId: req.dbUser!.tenantId,
  }));
});
export default router;
