import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  DEFAULT_TENANT_ID,
  LEAD_STATUSES,
  crmInteractionsTable,
  leadsTable,
  requireDb,
  trafficEventsTable,
  type LeadStatus,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/enterprise-core";

export const LEAD_CONSENT_VERSION = "realestatex-lead-v1";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const TRAFFIC_EVENT_TYPES = new Set(["page_view", "tool_open"]);

type Window = { startedAt: number; count: number };
function createLimiter(limit: number, windowMs: number) {
  const entries = new Map<string, Window>();
  return (key: string): boolean => {
    const now = Date.now();
    const current = entries.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      entries.set(key, { startedAt: now, count: 1 });
      if (entries.size > 5_000) {
        for (const [k, v] of entries) if (now - v.startedAt >= windowMs) entries.delete(k);
      }
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}
const allowLead = createLimiter(5, 60 * 60 * 1000);
const allowTraffic = createLimiter(120, 60 * 1000);
const allowAi = createLimiter(20, 60 * 60 * 1000);

function clientAddress(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

function hashAddress(address: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to hash visitor addresses.");
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${secret}:${day}:${address}`).digest("hex");
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(0, max);
  return cleaned || undefined;
}

function pathOnly(value: unknown): string | undefined {
  const raw = text(value, 300);
  if (!raw) return undefined;
  try {
    const url = new URL(raw, "https://placeholder.invalid");
    return url.pathname.slice(0, 200);
  } catch {
    return undefined;
  }
}

function referrerHost(value: unknown): string | undefined {
  const raw = text(value, 300);
  if (!raw) return undefined;
  try {
    return new URL(raw).hostname.slice(0, 200);
  } catch {
    return undefined;
  }
}

export function computeLeadScore(input: {
  phone?: string;
  company?: string;
  interest?: string;
  propertyCount?: number;
}): number {
  let score = 30;
  if (input.phone) score += 20;
  if (input.company) score += 20;
  if (input.interest) score += 10;
  if (input.propertyCount && input.propertyCount > 0) {
    score += Math.min(20, 5 + input.propertyCount * 3);
  }
  return Math.min(100, score);
}

export const publicSalesRouter: IRouter = Router();

publicSalesRouter.post("/public/leads", async (req, res): Promise<void> => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.website) {
      // Honeypot field: pretend success without storing.
      res.status(201).json({ ok: true });
      return;
    }
    if (!allowLead(hashAddress(clientAddress(req)))) {
      res.status(429).json({ error: "Te veel aanvragen. Probeer het later opnieuw." });
      return;
    }
    if (body.consent !== true) {
      res.status(400).json({ error: "Toestemming (AVG) is verplicht om je aanvraag te verwerken." });
      return;
    }
    const name = text(body.name, 200);
    const email = text(body.email, 254)?.toLowerCase();
    if (!name) {
      res.status(400).json({ error: "Naam is verplicht." });
      return;
    }
    if (!email || !EMAIL_PATTERN.test(email)) {
      res.status(400).json({ error: "Een geldig e-mailadres is verplicht." });
      return;
    }
    const phone = text(body.phone, 40);
    const company = text(body.company, 200);
    const interest = text(body.interest, 120);
    const propertyCount = Number.isFinite(Number(body.propertyCount))
      ? Math.max(0, Math.min(1000, Math.floor(Number(body.propertyCount))))
      : undefined;
    const source = text(body.source, 80) ?? "landing";
    const now = new Date();

    const { db } = requireDb();
    const [lead] = await db
      .insert(leadsTable)
      .values({
        tenantId: DEFAULT_TENANT_ID,
        name,
        email,
        phone,
        company,
        leadScore: computeLeadScore({ phone, company, interest, propertyCount }),
        consent: true,
        consentVersion: LEAD_CONSENT_VERSION,
        consentedAt: now,
        metadata: { source, ...(interest ? { interest } : {}), ...(propertyCount !== undefined ? { propertyCount } : {}) },
      })
      .returning({ id: leadsTable.id });
    await recordAuditEvent({
      tenantId: DEFAULT_TENANT_ID,
      action: "sales.lead.captured",
      entityType: "lead",
      entityId: lead!.id,
      actorId: "public-visitor",
      metadata: { source, consentVersion: LEAD_CONSENT_VERSION },
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    req.log?.error({ err: error }, "Could not save the lead");
    res.status(503).json({ error: "Je aanvraag kon niet worden opgeslagen. Probeer het later opnieuw." });
  }
});

publicSalesRouter.post("/public/traffic", async (req, res): Promise<void> => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    // The client only sends events after the visitor gave measurement consent.
    if (body.consent !== true) {
      res.status(400).json({ error: "Measurement consent is required." });
      return;
    }
    const address = clientAddress(req);
    const ipHash = hashAddress(address);
    if (!allowTraffic(ipHash)) {
      res.status(429).json({ error: "Too many events." });
      return;
    }
    const sessionId = text(body.sessionId, 64);
    const pageUrl = pathOnly(body.pageUrl);
    const eventType = text(body.eventType, 40);
    if (!sessionId || !/^[A-Za-z0-9_-]{8,64}$/u.test(sessionId) || !pageUrl || !eventType || !TRAFFIC_EVENT_TYPES.has(eventType)) {
      res.status(400).json({ error: "Invalid traffic event." });
      return;
    }
    const { db } = requireDb();
    await db.insert(trafficEventsTable).values({
      tenantId: DEFAULT_TENANT_ID,
      sessionId,
      pageUrl,
      referrer: referrerHost(body.referrer),
      userAgent: text(req.headers["user-agent"], 300),
      ipHash,
      eventType,
    });
    res.status(204).end();
  } catch (error) {
    req.log?.error({ err: error }, "Could not save the traffic event");
    res.status(503).json({ error: "Traffic event could not be saved." });
  }
});

export const salesRouter: IRouter = Router();

function requireSalesAdmin(req: Request, res: Response): { tenantId: string; actorId: string } | undefined {
  if (!req.dbUser) {
    res.status(401).json({ error: "Authentication required" });
    return undefined;
  }
  if (req.dbUser.role !== "admin") {
    res.status(403).json({ error: "Alleen beheerders hebben toegang tot Sales & CRM." });
    return undefined;
  }
  return { tenantId: req.dbUser.tenantId, actorId: req.dbUser.id };
}

const TOOL_LABELS: Array<[string, string]> = [
  ["/property-transformer", "Property Transformer"],
  ["/calculators", "Rekentools (WWS)"],
  ["/suite", "Suite / EnergyX-modules"],
  ["/dealing-room", "Dealing Room"],
  ["/training-room", "Training Room"],
  ["/market", "Markt"],
  ["/properties", "Objecten"],
  ["/dashboard", "Overzicht"],
];

salesRouter.get("/sales/analytics", async (req, res, next): Promise<void> => {
  try {
    const scope = requireSalesAdmin(req, res);
    if (!scope) return;
    const { db } = requireDb();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeSince = new Date(Date.now() - 5 * 60 * 1000);
    const inTenant = eq(trafficEventsTable.tenantId, scope.tenantId);
    const [totals] = await db
      .select({
        views: sql<number>`count(*) filter (where ${trafficEventsTable.eventType} = 'page_view')::int`,
        sessions: sql<number>`count(distinct ${trafficEventsTable.sessionId})::int`,
      })
      .from(trafficEventsTable)
      .where(and(inTenant, gt(trafficEventsTable.timestamp, dayAgo)));
    const [active] = await db
      .select({ sessions: sql<number>`count(distinct ${trafficEventsTable.sessionId})::int` })
      .from(trafficEventsTable)
      .where(and(inTenant, gt(trafficEventsTable.timestamp, activeSince)));
    const pages = await db
      .select({
        page: trafficEventsTable.pageUrl,
        views: sql<number>`count(*)::int`,
      })
      .from(trafficEventsTable)
      .where(and(inTenant, gt(trafficEventsTable.timestamp, dayAgo)))
      .groupBy(trafficEventsTable.pageUrl)
      .orderBy(desc(sql`count(*)`))
      .limit(50);
    const recent = await db
      .select({
        page: trafficEventsTable.pageUrl,
        eventType: trafficEventsTable.eventType,
        referrer: trafficEventsTable.referrer,
        timestamp: trafficEventsTable.timestamp,
      })
      .from(trafficEventsTable)
      .where(inTenant)
      .orderBy(desc(trafficEventsTable.timestamp))
      .limit(15);
    const tools = TOOL_LABELS.map(([prefix, label]) => ({
      tool: label,
      views: pages.filter((row) => row.page.startsWith(prefix)).reduce((sum, row) => sum + row.views, 0),
    }))
      .filter((row) => row.views > 0)
      .sort((a, b) => b.views - a.views);
    res.json({
      last24h: { pageViews: totals?.views ?? 0, sessions: totals?.sessions ?? 0 },
      activeSessions: active?.sessions ?? 0,
      topPages: pages.slice(0, 8),
      tools,
      recent,
    });
  } catch (error) {
    next(error);
  }
});

salesRouter.get("/sales/leads", async (req, res, next): Promise<void> => {
  try {
    const scope = requireSalesAdmin(req, res);
    if (!scope) return;
    const { db } = requireDb();
    res.json(
      await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.tenantId, scope.tenantId))
        .orderBy(desc(leadsTable.createdAt))
        .limit(500),
    );
  } catch (error) {
    next(error);
  }
});

salesRouter.patch("/sales/leads/:id", async (req, res, next): Promise<void> => {
  try {
    const scope = requireSalesAdmin(req, res);
    if (!scope) return;
    const status = (req.body as Record<string, unknown>)?.status;
    if (typeof status !== "string" || !LEAD_STATUSES.includes(status as LeadStatus)) {
      res.status(400).json({ error: `status must be one of ${LEAD_STATUSES.join(", ")}.` });
      return;
    }
    if (!/^[0-9a-f-]{36}$/iu.test(req.params.id ?? "")) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }
    const { db } = requireDb();
    const [lead] = await db
      .update(leadsTable)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(leadsTable.id, req.params.id!), eq(leadsTable.tenantId, scope.tenantId)))
      .returning();
    if (!lead) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }
    await db.insert(crmInteractionsTable).values({
      tenantId: scope.tenantId,
      leadId: lead.id,
      actionType: "status_change",
      notes: `Status gewijzigd naar ${status}`,
    });
    await recordAuditEvent({
      tenantId: scope.tenantId,
      action: "sales.lead.status_changed",
      entityType: "lead",
      entityId: lead.id,
      actorId: scope.actorId,
      metadata: { status },
    });
    res.json(lead);
  } catch (error) {
    next(error);
  }
});

salesRouter.post("/sales/leads/:id/notes", async (req, res, next): Promise<void> => {
  try {
    const scope = requireSalesAdmin(req, res);
    if (!scope) return;
    const notes = text((req.body as Record<string, unknown>)?.notes, 2000);
    if (!notes) {
      res.status(400).json({ error: "notes is required." });
      return;
    }
    const { db } = requireDb();
    const [lead] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, req.params.id!), eq(leadsTable.tenantId, scope.tenantId)))
      .limit(1);
    if (!lead) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }
    const [interaction] = await db
      .insert(crmInteractionsTable)
      .values({ tenantId: scope.tenantId, leadId: lead.id, actionType: "note", notes })
      .returning();
    res.status(201).json(interaction);
  } catch (error) {
    next(error);
  }
});

salesRouter.get("/sales/assistant", async (req, res, next): Promise<void> => {
  try {
    const scope = requireSalesAdmin(req, res);
    if (!scope) return;
    const { db } = requireDb();
    res.json(
      await db
        .select({
          id: crmInteractionsTable.id,
          leadId: crmInteractionsTable.leadId,
          leadName: leadsTable.name,
          actionType: crmInteractionsTable.actionType,
          notes: crmInteractionsTable.notes,
          aiGeneratedSummary: crmInteractionsTable.aiGeneratedSummary,
          createdAt: crmInteractionsTable.createdAt,
        })
        .from(crmInteractionsTable)
        .innerJoin(leadsTable, eq(leadsTable.id, crmInteractionsTable.leadId))
        .where(eq(crmInteractionsTable.tenantId, scope.tenantId))
        .orderBy(desc(crmInteractionsTable.createdAt))
        .limit(50),
    );
  } catch (error) {
    next(error);
  }
});

salesRouter.post("/sales/leads/:id/ai-recommendation", async (req, res, next): Promise<void> => {
  try {
    const scope = requireSalesAdmin(req, res);
    if (!scope) return;
    if (!allowAi(scope.actorId)) {
      res.status(429).json({ error: "Te veel AI-verzoeken. Probeer het later opnieuw." });
      return;
    }
    const { db } = requireDb();
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.id, req.params.id!), eq(leadsTable.tenantId, scope.tenantId)))
      .limit(1);
    if (!lead) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }
    const history = await db
      .select({ actionType: crmInteractionsTable.actionType, notes: crmInteractionsTable.notes })
      .from(crmInteractionsTable)
      .where(and(eq(crmInteractionsTable.leadId, lead.id), eq(crmInteractionsTable.tenantId, scope.tenantId)))
      .orderBy(desc(crmInteractionsTable.createdAt))
      .limit(8);
    // Data minimisation: no e-mail address or phone number is sent to the AI provider.
    const profile = {
      status: lead.status,
      leadScore: lead.leadScore,
      company: lead.company ?? null,
      interest: (lead.metadata as Record<string, unknown>).interest ?? null,
      daysSinceCapture: Math.floor((Date.now() - lead.createdAt.getTime()) / 86_400_000),
      recentActivity: history,
    };
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Je bent een verkoopassistent voor RealEstateX (vastgoedanalyse en verduurzaming in Nederland). Geef in het Nederlands, in maximaal 3 korte zinnen, een concrete aanbeveling voor de volgende opvolgactie bij deze lead. Verzin geen feiten.",
        },
        { role: "user", content: JSON.stringify(profile) },
      ],
    });
    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) {
      res.status(502).json({ error: "De AI-assistent gaf geen antwoord." });
      return;
    }
    const [interaction] = await db
      .insert(crmInteractionsTable)
      .values({
        tenantId: scope.tenantId,
        leadId: lead.id,
        actionType: "ai_recommendation",
        aiGeneratedSummary: summary.slice(0, 2000),
      })
      .returning();
    res.status(201).json(interaction);
  } catch (error) {
    req.log?.error({ err: error }, "AI recommendation failed");
    res.status(502).json({ error: "De AI-aanbeveling kon niet worden opgehaald." });
    void next;
  }
});

export default salesRouter;
