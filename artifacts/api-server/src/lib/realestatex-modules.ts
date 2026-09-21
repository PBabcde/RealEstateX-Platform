import type { PropertyRecord } from "./realestatex-storage";

export function calculateValuation(input: {
  woonoppervlak: number;
  energielabel?: string;
  locatieFactor?: number;
}): { status: string; valuation: number; pricePerSquareMeter: number } {
  const locationFactor = input.locatieFactor ?? 1;
  const labelBonus = ["A", "B"].includes(input.energielabel ?? "") ? 15000 : 0;
  const valuation = Math.round(
    input.woonoppervlak * 3000 * locationFactor + labelBonus,
  );

  return {
    status: "ok",
    valuation,
    pricePerSquareMeter: Math.round(valuation / input.woonoppervlak),
  };
}

export function calculateRental(input: {
  huurprijs: number;
  kosten: number;
  investering?: number;
}): { status: string; annualRendement: number; grossYield: number } {
  const annualRendement = Math.round(input.huurprijs * 12 - input.kosten);
  const grossYield =
    input.investering && input.investering > 0
      ? Number(((input.huurprijs * 12) / input.investering) * 100).toFixed(2)
      : 0;

  return {
    status: "ok",
    annualRendement,
    grossYield: Number(grossYield),
  };
}

export function calculateMortgage(input: {
  principal: number;
  interest: number;
  years: number;
}): { status: string; monthlyPayment: number; totalRepayment: number } {
  const annualRate = input.interest > 1 ? input.interest / 100 : input.interest;
  const monthlyRate = annualRate / 12;
  const months = input.years * 12;
  const payment =
    monthlyRate === 0
      ? input.principal / months
      : (input.principal * monthlyRate) /
        (1 - Math.pow(1 + monthlyRate, -months));

  return {
    status: "ok",
    monthlyPayment: Number(payment.toFixed(2)),
    totalRepayment: Number((payment * months).toFixed(2)),
  };
}

function numberFromFeature(
  property: PropertyRecord,
  key: string,
): number | undefined {
  const value = property.kenmerken?.[key];
  if (value == null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildDashboardSummary(properties: PropertyRecord[]): {
  propertyCount: number;
  totalArea: number;
  averageValuation: number;
  averageRentalYield: number;
  marketTrend: string;
  lastUpdated: string;
} {
  const valuations = properties.map((property) =>
    calculateValuation({
      woonoppervlak: property.woonoppervlak,
      energielabel: property.energielabel,
    }).valuation,
  );
  const yields = properties
    .map((property) => {
      const rent = numberFromFeature(property, "huurprijs");
      const investment = numberFromFeature(property, "investering");
      return rent && investment
        ? calculateRental({
            huurprijs: rent,
            kosten: numberFromFeature(property, "kosten") ?? 0,
            investering: investment,
          }).grossYield
        : undefined;
    })
    .filter((value): value is number => value != null);

  return {
    propertyCount: properties.length,
    totalArea: properties.reduce(
      (total, property) => total + property.woonoppervlak,
      0,
    ),
    averageValuation: valuations.length
      ? Math.round(valuations.reduce((total, value) => total + value, 0) / valuations.length)
      : 0,
    averageRentalYield: yields.length
      ? Number(
          (yields.reduce((total, value) => total + value, 0) / yields.length).toFixed(
            2,
          ),
        )
      : 0,
    marketTrend: "Stijgende markt in stedelijke gebieden",
    lastUpdated: new Date().toISOString(),
  };
}