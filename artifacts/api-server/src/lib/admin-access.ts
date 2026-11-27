import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { DEFAULT_TENANT_ID } from "@workspace/db";

const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = "realestatex_admin_session";
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 10;
const loginAttempts = new Map<string, { startedAt: number; count: number }>();

function sessionSecret(): string | undefined {
  return process.env.SESSION_SECRET || process.env.ADMIN_ACCESS_KEY || undefined;
}

function adminKey(): string | undefined {
  return process.env.ADMIN_ACCESS_KEY || undefined;
}

function cookieHeader(req: Request): string | undefined {
  const prefix = `${COOKIE_NAME}=`;
  const item = (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return item?.slice(prefix.length);
}

function signature(expiresAt: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`realestatex-admin:${expiresAt}`)
    .digest("hex");
}

export function isAdminAccessSession(req: Request): boolean {
  const secret = sessionSecret();
  const token = cookieHeader(req);
  if (!secret || !token) return false;

  const [rawExpiry, suppliedSignature, extra] = token.split(".");
  if (extra !== undefined || !rawExpiry || !/^\d{10,13}$/u.test(rawExpiry) ||
      !suppliedSignature || !/^[0-9a-f]{64}$/iu.test(suppliedSignature)) {
    return false;
  }

  const expiresAt = Number(rawExpiry);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + SESSION_LIFETIME_SECONDS + 60) {
    return false;
  }

  const expected = Buffer.from(signature(rawExpiry, secret), "hex");
  const supplied = Buffer.from(suppliedSignature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function allowLoginAttempt(address: string): boolean {
  const now = Date.now();
  const current = loginAttempts.get(address);
  if (!current || now - current.startedAt >= ATTEMPT_WINDOW_MS) {
    loginAttempts.set(address, { startedAt: now, count: 1 });
    if (loginAttempts.size > 5_000) {
      for (const [key, value] of loginAttempts) {
        if (now - value.startedAt >= ATTEMPT_WINDOW_MS) loginAttempts.delete(key);
      }
    }
    return true;
  }
  current.count += 1;
  return current.count <= MAX_ATTEMPTS_PER_WINDOW;
}

function suppliedKeyMatches(value: unknown, expected: string): boolean {
  if (typeof value !== "string" || value.length > 1024) return false;
  const expectedDigest = createHash("sha256").update(expected).digest();
  const suppliedDigest = createHash("sha256").update(value).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

function setSessionCookie(res: Response, token: string, maxAge: number): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: maxAge * 1000,
  });
}

export function adminAccessIdentity() {
  return {
    actorId: "admin-access",
    tenantId: DEFAULT_TENANT_ID,
  };
}

export async function createAdminAccessSession(
  req: Request,
  res: Response,
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  const address = firstForwarded || req.ip || req.socket.remoteAddress || "unknown";
  if (!allowLoginAttempt(address)) {
    res.status(429).json({ error: "Te veel pogingen. Probeer het later opnieuw." });
    return;
  }

  const expectedKey = adminKey();
  const secret = sessionSecret();
  if (!expectedKey || !secret) {
    res.status(503).json({ error: "Admin-toegang is niet geconfigureerd." });
    return;
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  if (!suppliedKeyMatches(body.key, expectedKey)) {
    res.status(401).json({ error: "De toegangssleutel is onjuist." });
    return;
  }

  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS);
  setSessionCookie(res, `${expiresAt}.${signature(expiresAt, secret)}`, SESSION_LIFETIME_SECONDS);
  res.status(201).json({ authenticated: true, expiresInSeconds: SESSION_LIFETIME_SECONDS });
}

export function clearAdminAccessSession(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

export function newAdminAccessCorrelationId(): string {
  return randomUUID();
}
