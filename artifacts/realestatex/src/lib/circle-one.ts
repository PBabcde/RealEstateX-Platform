import { BASELINE_HEAT_PUMP_KW, MIN_GROSS_BAR, calculateReturns, classifyRegion } from "@workspace/investment-policy";
export const CIRCLE_ONE_MIN_YIELD = MIN_GROSS_BAR;
export const CIRCLE_ONE_HEAT_PUMP_KW = BASELINE_HEAT_PUMP_KW;

export interface CircleOneInput {
  region: "gorinchem" | "gooi" | "vlaanderen" | "outside";
  radiusKm: number;
  distanceKm: number;
  purchasePrice: number;
  acquisitionCosts: number;
  renovationCosts: number;
  heatPumpCosts: number;
  pvCosts: number;
  panelCount: number;
  panelWp: number;
  monthlyRent: number;
  vacancyPercent: number;
  annualOperatingCosts: number;
}

export const circleOneExample: CircleOneInput = {
  region: "gorinchem", radiusKm: 60, distanceKm: 42,
  purchasePrice: 200000, acquisitionCosts: 20000, renovationCosts: 20000,
  heatPumpCosts: 9000, pvCosts: 7000, panelCount: 10, panelWp: 450,
  monthlyRent: 1900, vacancyPercent: 5, annualOperatingCosts: 2400,
};

export function calculateCircleOne(input: CircleOneInput) {
  const errors: string[] = [];
  if (!["gorinchem", "gooi", "vlaanderen", "outside"].includes(input.region)) errors.push("Kies een geldige regio.");
  if (!Number.isFinite(input.radiusKm) || input.radiusKm < 50 || input.radiusKm > 60) errors.push("De zoekstraal moet tussen 50 en 60 km liggen.");
  if (!Number.isFinite(input.distanceKm) || input.distanceKm < 0) errors.push("Vul een geldige afstand in.");
  if (!(input.heatPumpCosts > 0) || !(input.pvCosts > 0)) errors.push("Neem positieve kosten voor de 5 kW-warmtepomp en glas-op-glas-PV op.");
  if (!Number.isInteger(input.panelCount) || input.panelCount <= 0 || !Number.isFinite(input.panelWp) || input.panelWp <= 0) errors.push("Vul een geldig aantal panelen en paneelvermogen in.");
  const pvKwp = input.panelCount * input.panelWp / 1000;
  if (!Number.isFinite(pvKwp)) errors.push("Het PV-vermogen is te groot.");
  if (errors.length) return { valid: false as const, errors };
  try {
    const result = calculateReturns({
      purchasePrice: input.purchasePrice, acquisitionCosts: input.acquisitionCosts,
      renovationCosts: input.renovationCosts, heatPumpCosts: input.heatPumpCosts,
      pvCosts: input.pvCosts, monthlyRent: input.monthlyRent,
      vacancyPercent: input.vacancyPercent, annualOperatingCosts: input.annualOperatingCosts,
    });
    const circle = classifyRegion(input);
    return { valid: true as const, errors: [], ...result, pvKwp, circle,
      regionEligible: circle !== null, eligible: circle !== null && result.yieldEligible };
  } catch (error) {
    return { valid: false as const, errors: [(error as Error).message] };
  }
}
