import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  energyxSyncsTable,
  leadsTable,
  pool,
  propertiesTable,
  trafficEventsTable,
  usersTable,
} from "@workspace/db";
import {
  listEntities,
  type CrmContactRecord,
  type DealRecord,
} from "./enterprise-modules";

type ControlRoomStatus =
  | "active"
  | "available"
  | "unavailable"
  | "development"
  | "unknown";

export type ControlRoomEvent = {
  id: string;
  level: "error" | "warning" | "info";
  source: string;
  message: string;
  occurredAt: string;
};

export const CONTROL_ROOM_MODULE_REGISTRY: Array<{
  id: string;
  name: string;
  category: string;
  detail: string;
}> = [
  {
    id: "core",
    name: "Platform Core",
    category: "Platform",
    detail: "Authenticatie, tenantcontext en API-routering.",
  },
  {
    id: "realestatex",
    name: "RealEstateX",
    category: "Vastgoed",
    detail: "Objecten, portfolio-overzicht en rapportfuncties.",
  },
  {
    id: "calculators",
    name: "Rekentools",
    category: "Analyse",
    detail: "Waardering, verhuur en hypotheekberekeningen.",
  },
  {
    id: "reports",
    name: "Rapportages",
    category: "Analyse",
    detail: "RealEstateX-rapporten en PDF-export.",
  },
  {
    id: "property-transformer",
    name: "Property Transformer",
    category: "Transformatie",
    detail: "AI-beeldtransformaties.",
  },
  {
    id: "sales-crm",
    name: "Sales & CRM",
    category: "Relatiebeheer",
    detail: "Bestaande leads-, analytics- en CRM-routes.",
  },
  {
    id: "assistant",
    name: "AssistantX & RAG",
    category: "Assistent",
    detail: "Assistent en tenant-scoped documentopslag.",
  },
  {
    id: "energyx",
    name: "EnergyX",
    category: "Verduurzaming",
    detail: "Bestaande EnergyX-routes; deze module is hier niet aangepast.",
  },
  {
    id: "opportunity-engine",
    name: "Opportunity Engine",
    category: "Toekomstige module",
    detail: "Aanduiding voor toekomstige ontwikkeling; geen functionaliteit toegevoegd.",
  },
  {
    id: "innovation-center",
    name: "Innovation Center",
    category: "Platformontwikkeling",
    detail: "Ideeën, feedback, beta- en partnerinteresse via bestaande CRM-opslag.",
  },
];

const MAX_EVENTS = 50;
const recentEvents: ControlRoomEvent[] = [];

export function recordControlRoomError(): void {
  recentEvents.unshift({
    id: randomUUID(),
    level: "error",
    source: "API",
    message: "Interne API-fout (500)",
    occurredAt: new Date().toISOString(),
  });
  recentEvents.length = Math.min(recentEvents.length, MAX_EVENTS);
}

function countValue(rows: Array<{ count: number }>): number | null {
  return Number.isFinite(rows[0]?.count) ? rows[0].count : null;
}

async function safely<T>(
  fallback: T,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch {
    return fallback;
  }
}

export async function getControlRoomSnapshot(tenantId: string) {
  const generatedAt = new Date().toISOString();
  const database = db;
  let databaseConnected = false;

  if (pool && database) {
    try {
      await pool.query("SELECT 1");
      databaseConnected = true;
    } catch {
      databaseConnected = false;
    }
  }

  const databaseStatus: ControlRoomStatus = databaseConnected
    ? "active"
    : "unavailable";
  const openAiConfigured = Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY &&
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  );
  const clerkConfigured = Boolean(
    process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );

  const [accountCount, propertyCount, leadsCount, traffic, recentAccounts, syncedProperties] =
    databaseConnected && database
      ? await Promise.all([
          safely<number | null>(null, async () => {
            const rows = await database
              .select({ count: sql<number>`count(*)::int` })
              .from(usersTable);
            return countValue(rows);
          }),
          safely<number | null>(null, async () => {
            const rows = await database
              .select({ count: sql<number>`count(*)::int` })
              .from(propertiesTable);
            return countValue(rows);
          }),
          safely<number | null>(null, async () => {
            const rows = await database
              .select({ count: sql<number>`count(*)::int` })
              .from(leadsTable)
              .where(eq(leadsTable.tenantId, tenantId));
            return countValue(rows);
          }),
          safely<{ pageViews: number; sessions: number } | null>(null, async () => {
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const [row] = await database
              .select({
                pageViews:
                  sql<number>`count(*) filter (where ${trafficEventsTable.eventType} = 'page_view')::int`,
                sessions:
                  sql<number>`count(distinct ${trafficEventsTable.sessionId})::int`,
              })
              .from(trafficEventsTable)
              .where(
                and(
                  eq(trafficEventsTable.tenantId, tenantId),
                  gt(trafficEventsTable.timestamp, since),
                ),
              );
            return {
              pageViews: row?.pageViews ?? 0,
              sessions: row?.sessions ?? 0,
            };
          }),
          safely<
            Array<{
              id: string;
              email: string | null;
              role: string;
              createdAt: string;
            }>
          >([], async () => {
            const rows = await database
              .select({
                id: usersTable.id,
                email: usersTable.email,
                role: usersTable.role,
                createdAt: usersTable.createdAt,
              })
              .from(usersTable)
              .orderBy(desc(usersTable.createdAt))
              .limit(8);
            return rows.map((row) => ({
              ...row,
              createdAt: row.createdAt.toISOString(),
            }));
          }),
          safely<number | null>(null, async () => {
            const rows = await database
              .select({ count: sql<number>`count(*)::int` })
              .from(energyxSyncsTable)
              .innerJoin(
                usersTable,
                eq(energyxSyncsTable.ownerId, usersTable.id),
              )
              .where(eq(usersTable.tenantId, tenantId));
            return countValue(rows);
          }),
        ])
      : [null, null, null, null, [], null];

  const [deals, contacts] = databaseConnected
    ? await Promise.all([
        safely<DealRecord[] | null>(null, () =>
          listEntities<DealRecord>("deal", tenantId),
        ),
        safely<CrmContactRecord[] | null>(null, () =>
          listEntities<CrmContactRecord>("crm-contact", tenantId),
        ),
      ])
    : [null, null];

  const alerts: string[] = [];
  if (!databaseConnected) {
    alerts.push("PostgreSQL is niet bereikbaar; database-afhankelijke totalen zijn niet beschikbaar.");
  }
  if (!clerkConfigured) {
    alerts.push("De Clerk-configuratie is niet volledig beschikbaar.");
  }
  if (!openAiConfigured) {
    alerts.push("Externe AI is niet geconfigureerd; de assistent gebruikt beperkte ingebouwde antwoorden.");
  }
  alerts.push("Build-, test- en publicatiestatus worden niet door de app-runtime aangeleverd.");
  alerts.push("Actieve gebruikers en Clerk-sessies worden niet door de app gemeten.");
  if (recentEvents.length > 0) {
    alerts.push("API-foutmeldingen worden alleen tijdelijk in het geheugen van dit proces bewaard.");
  }

  const services = [
    {
      id: "api",
      name: "RealEstateX API",
      status: "active" as const,
      detail: "Deze statusaanvraag is door de API verwerkt.",
    },
    {
      id: "database",
      name: "PostgreSQL",
      status: databaseStatus,
      detail: databaseConnected
        ? "Verbinding gecontroleerd met SELECT 1."
        : "Geen actieve PostgreSQL-verbinding bevestigd.",
    },
    {
      id: "clerk",
      name: "Clerk-authenticatie",
      status: clerkConfigured ? ("active" as const) : ("unavailable" as const),
      detail: clerkConfigured
        ? "Configuratie aanwezig; actieve sessies worden niet gemeten."
        : "Vereiste configuratie ontbreekt of is niet beschikbaar.",
    },
    {
      id: "external-ai",
      name: "Externe AI-provider",
      status: openAiConfigured ? ("available" as const) : ("unavailable" as const),
      detail: openAiConfigured
        ? "Providerconfiguratie aanwezig; runtime-beschikbaarheid niet apart getest."
        : "Geen providerconfiguratie vastgesteld.",
    },
  ];

  const modules = CONTROL_ROOM_MODULE_REGISTRY.map((module) => {
    let status: ControlRoomStatus = "active";
    let detail = module.detail;
    if (module.id === "property-transformer") {
      status = openAiConfigured ? "available" : "unavailable";
      detail = openAiConfigured
        ? "AI-providerinstellingen zijn aanwezig; afzonderlijke generatie is niet getest."
        : "Voor beeldtransformaties is de externe AI-provider niet geconfigureerd.";
    } else if (module.id === "realestatex" && !databaseConnected) {
      status = "unavailable";
      detail = "De vastgoedroutes bestaan, maar de database is niet beschikbaar.";
    } else if (module.id === "reports" && !databaseConnected) {
      status = "unavailable";
      detail = "Rapportages zijn afhankelijk van vastgoeddata; de database is niet beschikbaar.";
    } else if (module.id === "sales-crm" && !databaseConnected) {
      status = "unavailable";
    } else if (module.id === "energyx") {
      status = databaseConnected ? "available" : "unavailable";
      detail = databaseConnected
        ? "Bestaande EnergyX-routes zijn beschikbaar; deze module is hier niet aangepast."
        : "De EnergyX-routes bestaan, maar opslag is niet beschikbaar; deze module is hier niet aangepast.";
    } else if (module.id === "innovation-center") {
      status = databaseConnected ? "active" : "unavailable";
      detail = databaseConnected
        ? "Inzendingen worden opgeslagen in het bestaande tenantgebonden CRM."
        : "De Innovation Center-pagina is beschikbaar, maar CRM-opslag is niet beschikbaar.";
    } else if (module.id === "opportunity-engine") {
      status = "development";
    }
    return { ...module, status, detail };
  });

  return {
    generatedAt,
    platform: {
      status: "active" as const,
      environment: process.env.NODE_ENV ?? "unknown",
      runtime: `Node.js ${process.version}`,
      uptimeSeconds: Math.floor(process.uptime()),
      build: "unknown" as const,
      tests: "unknown" as const,
      deployment: "unknown" as const,
      alerts,
    },
    api: {
      status: "active" as const,
      health: "active" as const,
      services,
    },
    database: {
      status: databaseStatus,
      connection: databaseConnected
        ? "PostgreSQL-verbinding actief"
        : "Geen actieve PostgreSQL-verbinding",
      accountCount,
      propertyCount,
    },
    authentication: {
      status: clerkConfigured ? ("active" as const) : ("unavailable" as const),
      provider: "Clerk",
      login: clerkConfigured ? ("active" as const) : ("unavailable" as const),
      activeSessions: null,
      detail: "De app gebruikt Clerk; actuele sessies zijn niet beschikbaar als meetbron.",
    },
    ai: {
      status: "available" as const,
      assistant: "active" as const,
      rag: "active" as const,
      externalProvider: openAiConfigured
        ? ("available" as const)
        : ("unavailable" as const),
      detail:
        "AssistantX gebruikt tenant-scoped document retrieval en ingebouwde antwoorden; de externe providerstatus is apart vermeld.",
    },
    modules,
    events: [...recentEvents],
    accounts: {
      total: accountCount,
      activeUsers: null,
      recent: recentAccounts,
    },
    salesCrm: {
      status: databaseConnected ? ("active" as const) : ("unavailable" as const),
      leads: leadsCount,
      deals: deals?.length ?? null,
      contacts: contacts?.length ?? null,
      pageViews24h: traffic?.pageViews ?? null,
      sessions24h: traffic?.sessions ?? null,
    },
    energyx: {
      status: databaseConnected
        ? ("available" as const)
        : ("unavailable" as const),
      syncedProperties,
      detail: "Bestaande EnergyX-status, zonder wijzigingen aan de module.",
    },
    realEstateX: {
      status: databaseConnected ? ("active" as const) : ("unavailable" as const),
      properties: propertyCount,
      reports: databaseConnected
        ? ("available" as const)
        : ("unavailable" as const),
      calculators: "available" as const,
      transformations: openAiConfigured
        ? ("available" as const)
        : ("unavailable" as const),
    },
  };
}
