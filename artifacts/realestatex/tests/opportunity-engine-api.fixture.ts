import type { MarketTrend, PropertyReport } from "../../../lib/api-client-react/src/generated/api.schemas";

export * from "./application-account.fixture";
export { ApiError, customFetch } from "../../../lib/api-client-react/src/custom-fetch";

declare global {
  interface Window {
    __opportunityReportRequests?: string[];
  }
}

const properties = [
  {
    propertyId: "property-visible-1",
    adres: "Kade 12",
    type: "Appartement",
    bouwjaar: 1998,
    woonoppervlak: 82,
    energielabel: "C",
    plaats: "Gorinchem",
    postcode: "4201AA",
    huurprijs: 1250,
    marktwaarde: 260000,
  },
  {
    propertyId: "property-visible-2",
    adres: "Parklaan 8",
    type: "Woning",
    bouwjaar: 1974,
    woonoppervlak: 116,
    energielabel: "D",
    plaats: "Utrecht",
    postcode: "3511AA",
    huurprijs: 1450,
    marktwaarde: 340000,
  },
];

const score = {
  flitsScore: 68,
  splitScore: 72,
  transformationScore: 81,
  energyScore: 64,
  subsidyScore: 55,
  totalScore: 71,
  decision: "HOLD",
  margin: 42000,
  grossYield: 7.8,
  gutFeelingScore: null,
  gutFeelingConfidence: 0,
  gutFeelingContribution: 0,
  assessment: {
    version: "investment-policy-v1",
    eligible: false,
    reasons: ["Toetsing is nog niet afgerond."],
    circle: null,
    totalInvestment: 218000,
    grossYieldPercent: 7.8,
    netYieldPercent: 5.1,
    baselineHeatPumpKw: 5,
    regionVerification: "SELF_DECLARED",
  },
};

const deals = [
  {
    dealId: "deal-visible-1",
    propertyId: "property-visible-1",
    title: "Kade renovatie",
    region: "Gorinchem",
    propertyType: "Appartement",
    energyLabel: "C",
    woonoppervlak: 82,
    askingPrice: 190000,
    renovationCost: 18000,
    expectedValue: 260000,
    monthlyRent: 1250,
    status: "HOLD",
    ownerId: "user-a",
    score,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
  },
  {
    dealId: "deal-visible-2",
    propertyId: "property-visible-2",
    title: "Parklaan case",
    region: "Utrecht",
    propertyType: "Woning",
    energyLabel: "D",
    woonoppervlak: 116,
    askingPrice: 270000,
    renovationCost: 26000,
    expectedValue: 340000,
    monthlyRent: 1450,
    status: "REVIEW",
    ownerId: "user-a",
    score: { ...score, margin: 44000 },
    createdAt: "2026-11-03T10:00:00.000Z",
    updatedAt: "2026-11-04T10:00:00.000Z",
  },
  {
    dealId: "deal-hidden-tenant",
    propertyId: "property-not-visible",
    title: "Niet zichtbare tenantcase",
    region: "Rotterdam",
    propertyType: "Woning",
    energyLabel: "B",
    woonoppervlak: 100,
    askingPrice: 300000,
    renovationCost: 10000,
    expectedValue: 360000,
    monthlyRent: 1600,
    status: "GO",
    ownerId: "user-b",
    score: { ...score, decision: "GO" },
    createdAt: "2026-11-05T10:00:00.000Z",
    updatedAt: "2026-11-06T10:00:00.000Z",
  },
];

const report: PropertyReport = {
  property: {
    property_id: "property-visible-1",
    name: null,
    address: "Kade 12",
    postcode: "4201AA",
    city: "Gorinchem",
    construction_year: 1998,
    living_area_m2: 82,
    energy_label: "C",
    monthly_rent_eur: 1250,
    market_value_eur: 260000,
  },
  energy_brain: {
    score: 70,
    recommended_measure: "HR++ glas",
    estimated_investment_eur: 4500,
    estimated_annual_saving_eur: 810,
    payback_years: 5.56,
    indicative: true,
  },
  profitability: {
    gross_yield_percent: 5.77,
    classification: "Gemiddeld",
    basis: "Jaarhuur / opgegeven marktwaarde",
    note: "Indicatief rapportresultaat.",
  },
  recommendation: "Optimalisatie aanbevolen",
  disclaimer: "Geen taxatie of investeringsgoedkeuring.",
  generated_at: "2026-11-06T10:00:00.000Z",
};

export const getListPropertiesQueryKey = () => ["/api/properties"] as const;
export const getListDealsQueryKey = () => ["/api/deals"] as const;
export const getGetMarketTrendsQueryKey = () => ["/api/market/trends"] as const;
export const getGetPropertyReportQueryKey = (propertyId: string) => [`/api/properties/${propertyId}/report`] as const;

export function useListProperties() {
  return { data: properties, isLoading: false, isError: false, refetch: async () => undefined };
}

export function useListDeals() {
  return { data: deals, isLoading: false, isError: false, refetch: async () => undefined };
}

export function useGetMarketTrends() {
  const data: MarketTrend = {
    status: "ok",
    trend: "Stijgende markt",
    change: 3.7,
    period: "Q3 2026",
  };
  return { data, isLoading: false, isError: false, refetch: async () => undefined };
}

export function useGetPropertyReport(propertyId: string) {
  window.__opportunityReportRequests ??= [];
  window.__opportunityReportRequests.push(propertyId);
  return {
    data: report,
    isLoading: false,
    isError: false,
    refetch: async () => undefined,
  };
}
