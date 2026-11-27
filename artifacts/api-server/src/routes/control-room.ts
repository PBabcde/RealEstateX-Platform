import { Router, type IRouter } from "express";
import { GetControlRoomResponse } from "@workspace/api-zod";
import { getControlRoomSnapshot } from "../lib/control-room";
import {
  forbidden,
  isAdministrator,
  requireAuthentication,
} from "../middlewares/authorization";
import { adminAccessIdentity, isAdminAccessSession } from "../lib/admin-access";

const router: IRouter = Router();

router.get(
  "/admin/control-room",
  async (req, res): Promise<void> => {
    const sessionAdmin = isAdminAccessSession(req);
    if (!req.dbUser && !sessionAdmin) {
      requireAuthentication(req, res, () => undefined);
      return;
    }
    if (!sessionAdmin && !isAdministrator(req)) {
      forbidden(res);
      return;
    }

    const tenantId = sessionAdmin ? adminAccessIdentity().tenantId : req.dbUser!.tenantId;
    const response = await getControlRoomSnapshot(tenantId);
    res.json(GetControlRoomResponse.parse(response));
  },
);

export default router;
