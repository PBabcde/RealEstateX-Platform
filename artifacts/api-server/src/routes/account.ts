import { Router } from "express";
import { GetAccountResponse } from "@workspace/api-zod";
import { requireAuthentication } from "../middlewares/authorization";
import { adminAccessIdentity, isAdminAccessSession } from "../lib/admin-access";
import { DEFAULT_TENANT_ID } from "@workspace/db";

const router = Router();
router.get("/account", (req, res): void => {
  if (isAdminAccessSession(req)) {
    const identity = adminAccessIdentity();
    res.json(GetAccountResponse.parse({
      id: identity.actorId,
      role: "admin",
      tenantId: DEFAULT_TENANT_ID,
    }));
    return;
  }
  if (!req.dbUser) {
    requireAuthentication(req, res, () => undefined);
    return;
  }
  res.json(GetAccountResponse.parse({
    id: req.dbUser!.id,
    role: req.dbUser!.role,
    tenantId: req.dbUser!.tenantId,
  }));
});
export default router;
