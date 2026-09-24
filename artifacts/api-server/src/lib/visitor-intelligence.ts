export type VisitorEventType =
  | "DEAL_VIEW"
  | "ROI_CALCULATOR"
  | "SUBSIDY_CALCULATOR"
  | "PDF_DOWNLOAD";

export interface VisitorIntentEvent {
  eventId: string;
  visitorId: string;
  eventType: VisitorEventType;
  dealId?: string;
  investorId?: string;
  occurredAt: string;
  consent: true;
}

export interface VisitorLeadScore {
  visitorId: string;
  score: number;
  intentLevel: "LOW" | "MEDIUM" | "HIGH";
  eventCount: number;
  lastSeen: string;
  viewedDealIds: string[];
}

export interface VisitorIntentSummary {
  asOf: string;
  windowDays: number;
  eventsCount: number;
  uniqueVisitors: number;
  uniqueInvestors: number;
  leads: VisitorLeadScore[];
  interactionCounts: Record<VisitorEventType, number>;
}

export interface DealSalesActivity {
  dealId: string;
  windowHours: number;
  uniqueVisitors: number;
  uniqueInvestors: number;
  dealViews: number;
  roiCalculatorInteractions: number;
  subsidyCalculatorInteractions: number;
  pdfDownloads: number;
  highIntentCount: number;
  urgencyLevel: "LOW" | "MEDIUM" | "HIGH";
  investorViewText: string;
}

const EVENT_WEIGHTS: Record<VisitorEventType, number> = {
  DEAL_VIEW: 10,
  ROI_CALCULATOR: 25,
  SUBSIDY_CALCULATOR: 20,
  PDF_DOWNLOAD: 35,
};

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function level(score: number): VisitorLeadScore["intentLevel"] {
  return score >= 70 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";
}

export function aggregateVisitorIntent(
  events: readonly VisitorIntentEvent[],
  options: { now?: Date; windowDays?: number } = {},
): VisitorIntentSummary {
  const asOfDate = options.now ?? new Date();
  const windowDays = options.windowDays ?? 30;
  const since = asOfDate.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const recent = events.filter(
    (event) => event.consent === true && parseTimestamp(event.occurredAt) >= since &&
      parseTimestamp(event.occurredAt) <= asOfDate.getTime(),
  );
  const groups = new Map<string, VisitorLeadScore & { rawScore: number }>();
  const interactionCounts: Record<VisitorEventType, number> = {
    DEAL_VIEW: 0, ROI_CALCULATOR: 0, SUBSIDY_CALCULATOR: 0, PDF_DOWNLOAD: 0,
  };
  for (const event of recent) {
    interactionCounts[event.eventType] += 1;
    const current = groups.get(event.visitorId) ?? {
      visitorId: event.visitorId, score: 0, rawScore: 0, intentLevel: "LOW",
      eventCount: 0, lastSeen: event.occurredAt, viewedDealIds: [],
    };
    current.rawScore += EVENT_WEIGHTS[event.eventType];
    current.score = Math.min(100, current.rawScore);
    current.eventCount += 1;
    if (parseTimestamp(event.occurredAt) > parseTimestamp(current.lastSeen)) current.lastSeen = event.occurredAt;
    if (event.dealId && event.eventType === "DEAL_VIEW" && !current.viewedDealIds.includes(event.dealId)) current.viewedDealIds.push(event.dealId);
    current.intentLevel = level(current.score);
    groups.set(event.visitorId, current);
  }
  const leads = [...groups.values()]
    .map(({ rawScore: _rawScore, ...lead }) => ({ ...lead, viewedDealIds: [...lead.viewedDealIds].sort() }))
    .sort((a, b) => b.score - a.score || a.visitorId.localeCompare(b.visitorId));
  return {
    asOf: asOfDate.toISOString(),
    windowDays,
    eventsCount: recent.length,
    uniqueVisitors: new Set(recent.map((event) => event.visitorId)).size,
    uniqueInvestors: new Set(recent.map((event) => event.investorId).filter(Boolean)).size,
    leads,
    interactionCounts,
  };
}

export function aggregateDealSalesActivity(
  dealId: string,
  events: readonly VisitorIntentEvent[],
  options: { now?: Date; windowHours?: number } = {},
): DealSalesActivity {
  const now = options.now ?? new Date();
  const windowHours = options.windowHours ?? 24;
  const since = now.getTime() - windowHours * 60 * 60 * 1000;
  const recent = events.filter(
    (event) => event.consent === true && event.dealId === dealId &&
      parseTimestamp(event.occurredAt) >= since && parseTimestamp(event.occurredAt) <= now.getTime(),
  );
  const uniqueVisitors = new Set(recent.map((event) => event.visitorId));
  const uniqueInvestors = new Set(recent.map((event) => event.investorId).filter(Boolean));
  const count = (type: VisitorEventType) => recent.filter((event) => event.eventType === type).length;
  const highIntentCount = recent.filter((event) => EVENT_WEIGHTS[event.eventType] >= 25).length;
  const urgencyLevel = uniqueInvestors.size >= 3 || highIntentCount >= 5 ? "HIGH" :
    uniqueInvestors.size >= 1 || highIntentCount >= 2 ? "MEDIUM" : "LOW";
  return {
    dealId, windowHours, uniqueVisitors: uniqueVisitors.size, uniqueInvestors: uniqueInvestors.size,
    dealViews: count("DEAL_VIEW"), roiCalculatorInteractions: count("ROI_CALCULATOR"),
    subsidyCalculatorInteractions: count("SUBSIDY_CALCULATOR"), pdfDownloads: count("PDF_DOWNLOAD"),
    highIntentCount, urgencyLevel,
    investorViewText: uniqueInvestors.size > 0
      ? `${uniqueInvestors.size} investeerder${uniqueInvestors.size === 1 ? "" : "s"} bekijkt deze deal.`
      : uniqueVisitors.size > 0 ? `${uniqueVisitors.size} bezoeker${uniqueVisitors.size === 1 ? "" : "s"} bekijken deze deal.` : "Nog geen recente activiteit.",
  };
}