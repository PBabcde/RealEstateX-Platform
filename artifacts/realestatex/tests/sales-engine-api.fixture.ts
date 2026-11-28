import { useQuery } from "@tanstack/react-query";
import type { CrmContactRecord, SalesContentType, SalesPartnerCategory, VisitorIntentSummary } from "../../../lib/api-client-react/src/generated/api.schemas";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

type TestAccount = { id: string; role: "admin" | "member"; tenantId: string };

export const getGetAccountQueryKey = () => ["/api/account"] as const;

declare global {
  interface Window {
    __salesTestRole?: "admin" | "member";
  }
}

export function useGetAccount() {
  const account = (): TestAccount => ({
    id: "sales-engine-test-admin",
    role: window.__salesTestRole ?? "admin",
    tenantId: "00000000-0000-0000-0000-000000000001",
  });
  return useQuery({ queryKey: ["/api/account"], queryFn: async () => account(), initialData: account() });
}

declare global {
  interface Window {
    __salesTestNotes?: string[];
    __salesTestStatuses?: string[];
    __contentDraftRequests?: Array<{ leadId: string; contentType: SalesContentType; partnerContactId?: string; dealId?: string }>;
    __copiedContentDrafts?: string[];
    __crmRequests?: Array<{ method: string; url: string; status?: unknown; name?: unknown }>;
  }
}

const leads = [
  {
    id: "00000000-0000-0000-0000-000000000101",
    name: "Voorbeeld lead",
    email: "lead@example.invalid",
    phone: null,
    company: "Voorbeeld BV",
    status: "new",
    leadScore: 60,
    createdAt: "2026-11-20T10:00:00.000Z",
    metadata: { source: "landing", interest: "Energierapport" },
  },
  {
    id: "00000000-0000-0000-0000-000000000102",
    name: "Gewonnen lead",
    email: "won@example.invalid",
    phone: null,
    company: null,
    status: "won",
    leadScore: 50,
    createdAt: "2026-11-19T10:00:00.000Z",
    metadata: { source: "innovation-center", interest: "Samenwerken" },
  },
];

const contacts: CrmContactRecord[] = [
  {
    contactId: "contact-early-adopter",
    type: "PARTNER",
    name: "Early adopter",
    company: "Innovator BV",
    status: "ACTIVE",
    partnerCategory: "warmtepompen",
    notes: "Beta-tester / early-adopter interesse: Ja\nPartnerinteresse: Ja",
    ownerId: "sales-engine-test-admin",
    createdAt: "2026-11-18T10:00:00.000Z",
    updatedAt: "2026-11-18T10:00:00.000Z",
  },
  {
    contactId: "contact-realtor",
    type: "MAKELAAR",
    name: "Makelaar",
    company: "Voorbeeld Makelaars",
    partnerCategory: "makelaar",
    status: "ACTIVE",
    ownerId: "sales-engine-test-admin",
    createdAt: "2026-11-18T10:00:00.000Z",
    updatedAt: "2026-11-18T10:00:00.000Z",
  },
  {
    contactId: "contact-legacy-partner",
    type: "PARTNER",
    name: "Bestaande CRM-partner",
    status: "ACTIVE",
    ownerId: "sales-engine-test-admin",
    createdAt: "2026-11-18T10:00:00.000Z",
    updatedAt: "2026-11-18T10:00:00.000Z",
  },
];

const analytics = {
  last24h: { pageViews: 12, sessions: 7 },
  activeSessions: 2,
  topPages: [{ page: "/market", views: 5 }],
  tools: [{ tool: "Dealing Room", views: 3 }],
  recent: [{ page: "/market", eventType: "page_view", referrer: "example.org", timestamp: "2026-11-27T08:00:00.000Z" }],
};

const intent: VisitorIntentSummary = {
  asOf: "2026-11-27T08:00:00.000Z",
  windowDays: 30,
  eventsCount: 3,
  uniqueVisitors: 2,
  uniqueInvestors: 1,
  leads: [
    { visitorId: "visitor-one", score: 80, intentLevel: "HIGH", eventCount: 2, lastSeen: "2026-11-27T07:00:00.000Z", viewedDealIds: ["deal-one"] },
    { visitorId: "visitor-two", score: 10, intentLevel: "LOW", eventCount: 1, lastSeen: "2026-11-27T06:00:00.000Z", viewedDealIds: [] },
  ],
  interactionCounts: { DEAL_VIEW: 1, ROI_CALCULATOR: 1, SUBSIDY_CALCULATOR: 0, PDF_DOWNLOAD: 1 },
};

export async function customFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method === "GET" && url === "/api/sales/leads") return structuredClone(leads) as T;
  if (method === "GET" && url === "/api/sales/analytics") return analytics as T;
  if (method === "GET" && url.startsWith("/api/visitor-intent/summary")) return intent as T;
  if (method === "GET" && url === "/api/crm/contacts") return structuredClone(contacts) as T;
  if (method === "GET" && url === "/api/sales/assistant") return [] as T;
  if (method === "GET" && url === "/api/sales/content-options") {
    return {
      partners: contacts.filter((contact) => contact.status === "ACTIVE" && contact.partnerCategory).map((contact) => ({
        contactId: contact.contactId, name: contact.name, company: contact.company ?? null,
        category: contact.partnerCategory as SalesPartnerCategory,
      })),
      deals: [{ dealId: "deal-approved", title: "Appartement centrum", region: "Utrecht", propertyType: "Appartement", energyLabel: "C", woonoppervlak: 74 }],
    } as T;
  }

  const body = typeof options.body === "string" ? JSON.parse(options.body) as Record<string, unknown> : {};
  const noteMatch = url.match(/^\/api\/sales\/leads\/([^/]+)\/notes$/u);
  if (method === "POST" && noteMatch) {
    const note = String(body.notes ?? "");
    window.__salesTestNotes ??= [];
    window.__salesTestNotes.push(note);
    return { id: "note-1", leadId: noteMatch[1], notes: note } as T;
  }
  const statusMatch = url.match(/^\/api\/sales\/leads\/([^/]+)$/u);
  if (method === "PATCH" && statusMatch) {
    window.__salesTestStatuses ??= [];
    window.__salesTestStatuses.push(String(body.status));
    const lead = leads.find((item) => item.id === statusMatch[1]);
    if (lead) lead.status = String(body.status);
    return lead as T;
  }
  const contentMatch = url.match(/^\/api\/sales\/leads\/([^/]+)\/content-draft$/u);
  if (method === "POST" && contentMatch) {
    const request = { leadId: contentMatch[1], ...body } as Window["__contentDraftRequests"][number];
    window.__contentDraftRequests ??= [];
    window.__contentDraftRequests.push(request);
    const partner = contacts.find((contact) => contact.contactId === body.partnerContactId);
    return {
      contentType: body.contentType,
      draft: "Concepttekst voor de geselecteerde doelgroep.",
      partnerCategory: partner?.partnerCategory ?? "warmtepompen",
      partnerName: partner?.name ?? null,
      dealTitle: body.contentType === "realtor_linkedin" ? "Appartement centrum" : null,
    } as T;
  }
  if (method === "POST" && url === "/api/crm/contacts") {
    window.__crmRequests ??= [];
    window.__crmRequests.push({ method, url, status: body.status, name: body.name, partnerCategory: body.partnerCategory });
    const contact: CrmContactRecord = {
      contactId: contacts.some((item) => item.contactId === "contact-created") ? "content-contact-created" : "contact-created",
      type: body.type as CrmContactRecord["type"],
      name: String(body.name),
      ...(typeof body.email === "string" ? { email: body.email } : {}),
      ...(typeof body.phone === "string" ? { phone: body.phone } : {}),
      ...(typeof body.company === "string" ? { company: body.company } : {}),
      ...(typeof body.partnerCategory === "string" ? { partnerCategory: body.partnerCategory as SalesPartnerCategory } : {}),
      status: "ACTIVE",
      ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
      ownerId: "sales-engine-test-admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    contacts.unshift(contact);
    return contact as T;
  }
  const contactMatch = url.match(/^\/api\/crm\/contacts\/([^/]+)$/u);
  if (method === "PATCH" && contactMatch) {
    window.__crmRequests ??= [];
    window.__crmRequests.push({ method, url, status: body.status, name: body.name, partnerCategory: body.partnerCategory });
    const contact = contacts.find((item) => item.contactId === decodeURIComponent(contactMatch[1]));
    if (!contact) throw new ApiError("Contact not found", 404);
    Object.assign(contact, body, { updatedAt: new Date().toISOString() });
    return structuredClone(contact) as T;
  }
  throw new ApiError(`Unexpected test request: ${method} ${url}`, 404);
}
