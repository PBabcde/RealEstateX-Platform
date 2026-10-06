import { getAuth } from "@clerk/express";
import { requireDb, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      dbUser?: User;
    }
  }
}

// Clerk validates the cookie first. Preserve the original subject-ID bridge,
// including existing roles and tenant membership; never sync identity columns.
export async function resolveLocalUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  if (!auth.userId) {
    next();
    return;
  }
  const userId = auth.sessionClaims?.userId;
  if (typeof userId !== "string" || !userId) {
    res.status(401).json({ error: "Authenticated session is missing its application user ID" });
    return;
  }
  const { db } = requireDb();
  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    const [inserted] = await db.insert(usersTable).values({ id: userId })
      .onConflictDoNothing().returning();
    user = inserted;
    if (!user) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    }
  }
  if (!user) {
    res.status(403).json({ error: "Application access unavailable" });
    return;
  }
  req.dbUser = user;
  next();
}
