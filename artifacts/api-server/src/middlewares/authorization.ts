import type { NextFunction, Request, Response } from "express";

export function requireAuthentication(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.dbUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function isAdministrator(req: Request): boolean {
  return req.dbUser?.role === "admin";
}

export function canAccessOwner(req: Request, ownerId: string): boolean {
  return Boolean(req.dbUser && (isAdministrator(req) || req.dbUser.id === ownerId));
}

export function canManageOwner(req: Request, ownerId: string): boolean {
  return (
    Boolean(req.dbUser &&
    (isAdministrator(req) || (req.dbUser.id === ownerId && req.dbUser.role === "owner")))
  );
}

export function forbidden(res: Response): void {
  res.status(403).json({ error: "You do not have access to this resource" });
}