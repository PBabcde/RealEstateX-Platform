import { Router, type IRouter } from "express";
import {
  clearAdminAccessSession,
  createAdminAccessSession,
  isAdminAccessSession,
} from "../lib/admin-access";

const router: IRouter = Router();

router.post("/admin-access/session", async (req, res): Promise<void> => {
  await createAdminAccessSession(req, res);
});

router.get("/admin-access/session", (req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ authenticated: isAdminAccessSession(req) });
});

router.delete("/admin-access/session", (_req, res): void => {
  clearAdminAccessSession(res);
  res.status(204).end();
});

export default router;
