import type { NextFunction, Request, Response } from "express";
import { assertWritableRuntime } from "./enterprise-core";

export async function enterpriseRecoveryGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (
    req.path === "/api/core/recovery/mode" ||
    req.path === "/api/core/recovery/integrity-check" ||
    req.path === "/api/core/recovery/points"
  ) {
    next();
    return;
  }

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  try {
    await assertWritableRuntime();
    next();
  } catch (error) {
    res.status(503).json({
      error: "Enterprise Core is in recovery mode",
      detail: error instanceof Error ? error.message : "Writes are temporarily disabled.",
    });
  }
}