import type { NextFunction, Request, Response } from "express";
import { assertWritableRuntime } from "./enterprise-core";

export async function enterpriseRecoveryGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (
    req.path === "/recovery/mode" ||
    req.path === "/recovery/integrity-check" ||
    req.path === "/recovery/points"
  ) {
    next();
    return;
  }

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  try {
    const tenantId = req.enterpriseContext?.tenantId;
    if (!tenantId) {
      res.status(503).json({
        error: "Enterprise Core authorization is not connected",
      });
      return;
    }
    await assertWritableRuntime(tenantId);
    next();
  } catch (error) {
    res.status(503).json({
      error: "Enterprise Core is in recovery mode",
      detail: error instanceof Error ? error.message : "Writes are temporarily disabled.",
    });
  }
}