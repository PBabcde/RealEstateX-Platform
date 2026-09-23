import type { NextFunction, Request, Response } from "express";

export type EnterpriseRequestContext = {
  actorId: string;
  tenantId?: string;
  roles: readonly string[];
};

declare global {
  namespace Express {
    interface Request {
      enterpriseContext?: EnterpriseRequestContext;
    }
  }
}

const OPERATOR_ROLES = new Set(["Admin", "Operator"]);

export function requireEnterpriseCoreOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const context = req.enterpriseContext;
  if (!context) {
    res.status(503).json({
      error: "Enterprise Core authorization is not connected",
    });
    return;
  }

  if (!context.actorId || !context.roles.some((role) => OPERATOR_ROLES.has(role))) {
    res.status(403).json({
      error: "Enterprise Core operator permission required",
    });
    return;
  }

  next();
}