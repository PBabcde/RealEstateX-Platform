import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export type EnterpriseRequestContext = {
  actorId: string;
  tenantId: string;
  roles: readonly string[];
  permissions: readonly string[];
  correlationId: string;
};

declare global {
  namespace Express {
    interface Request {
      enterpriseContext?: EnterpriseRequestContext;
    }
  }
}

const OPERATOR_ROLES = new Set(["Admin", "Operator"]);

const ROLE_MAP: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  member: "Member",
};

function getCorrelationId(req: Request): string {
  const value = req.headers["x-correlation-id"];
  if (typeof value === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(value)) {
    return value;
  }
  return randomUUID();
}

export async function attachEnterpriseContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Geen geldige authenticatie gevonden.",
    });
    return;
  }

  try {
    req.enterpriseContext = {
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      roles: [ROLE_MAP[req.user.role] ?? "Member"],
      permissions: [],
      correlationId: getCorrelationId(req),
    };
    next();
  } catch (error) {
    next(error);
  }
}

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