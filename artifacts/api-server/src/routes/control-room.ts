import { Router, type IRouter } from "express";
import { GetControlRoomResponse } from "@workspace/api-zod";
import { getControlRoomSnapshot } from "../lib/control-room";
import {
  forbidden,
  isAdministrator,
  requireAuthentication,
} from "../middlewares/authorization";

const router: IRouter = Router();

router.get(
  "/admin/control-room",
  requireAuthentication,
  async (req, res): Promise<void> => {
    if (!isAdministrator(req)) {
      forbidden(res);
      return;
    }

    const response = await getControlRoomSnapshot(req.dbUser!.tenantId);
    res.json(GetControlRoomResponse.parse(response));
  },
);

export default router;
