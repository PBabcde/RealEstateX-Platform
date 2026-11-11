export const MIN_GROSS_BAR = 7.5;
export const BASELINE_HEAT_PUMP_KW = 5;
export const BASELINE_HEAT_PUMP_COST = 9000; // Indicative installed cost, not a supplier quote.
export const POLICY_VERSION = "gross-bar-5kw-three-circles-v1";

/** Costs exclude one another. Subsidies, future value and savings never reduce the BAR denominator. */
export interface InvestmentAssumptions {
  acquisitionCosts: number;
  heatPumpCosts: number;
  pvCosts: number;
  heatPumpKw: number;
  glassGlassPv: boolean;
  vacancyPercent: number;
  annualOperatingCosts: number;
  region: "gorinchem" | "gooi" | "vlaanderen" | "outside";
  radiusKm: number;
  distanceKm: number;
}

export function classifyRegion(input: Pick<InvestmentAssumptions, "region" | "radiusKm" | "distanceKm">): 1 | 2 | 3 | null {
  if (input.region === "gooi") return 2;
  if (input.region === "vlaanderen") return 3;
  if (input.region === "gorinchem" && Number.isFinite(input.radiusKm) &&
      input.radiusKm >= 50 && input.radiusKm <= 60 &&
      Number.isFinite(input.distanceKm) && input.distanceKm >= 0 && input.distanceKm <= input.radiusKm) return 1;
  return null;
}

export function calculateReturns(input: {
  purchasePrice: number; acquisitionCosts: number; renovationCosts: number;
  heatPumpCosts: number; pvCosts: number; monthlyRent: number;
  vacancyPercent: number; annualOperatingCosts: number;
}) {
  if (Object.values(input).some(value => !Number.isFinite(value) || value < 0) ||
      input.purchasePrice <= 0 || input.vacancyPercent > 100) {
    throw new Error("Ongeldige bedragen of leegstand voor de rendementsberekening.");
  }
  const kitInvestment = input.heatPumpCosts + input.pvCosts;
  const totalInvestment = input.purchasePrice + input.acquisitionCosts + input.renovationCosts + kitInvestment;
  const grossAnnualRent = input.monthlyRent * 12;
  const vacancyLoss = grossAnnualRent * input.vacancyPercent / 100;
  const effectiveAnnualRent = grossAnnualRent - vacancyLoss;
  const netAnnualRent = effectiveAnnualRent - input.annualOperatingCosts;
  const grossYieldPercent = grossAnnualRent / totalInvestment * 100;
  const netYieldPercent = netAnnualRent / totalInvestment * 100;
  const requiredMonthlyRent = Math.ceil(totalInvestment * MIN_GROSS_BAR / 100 / 12 * 100) / 100;
  const result = { kitInvestment, totalInvestment, grossAnnualRent, vacancyLoss, effectiveAnnualRent,
    netAnnualRent, grossYieldPercent, netYieldPercent, requiredMonthlyRent };
  if (Object.values(result).some(value => !Number.isFinite(value))) throw new Error("De invoer is te groot om veilig te berekenen.");
  return { ...result, yieldEligible: grossAnnualRent >= totalInvestment * MIN_GROSS_BAR / 100 };
}

export function assessInvestment(base: { askingPrice: number; renovationCost: number; monthlyRent: number },
  assumptions?: InvestmentAssumptions) {
  const reasons: string[] = [];
  let returns: ReturnType<typeof calculateReturns> | null = null;
  let circle: 1 | 2 | 3 | null = null;
  if (!assumptions) reasons.push("Investeringskosten, installatiebaseline en regiokeuze ontbreken; opnieuw toetsen.");
  else {
    try {
      returns = calculateReturns({ purchasePrice: base.askingPrice, renovationCosts: base.renovationCost,
        monthlyRent: base.monthlyRent, acquisitionCosts: assumptions.acquisitionCosts,
        heatPumpCosts: assumptions.heatPumpCosts, pvCosts: assumptions.pvCosts,
        vacancyPercent: assumptions.vacancyPercent, annualOperatingCosts: assumptions.annualOperatingCosts });
    } catch (error) { reasons.push((error as Error).message); }
    if (assumptions.heatPumpKw !== BASELINE_HEAT_PUMP_KW || assumptions.glassGlassPv !== true ||
        !(assumptions.heatPumpCosts > 0) || !(assumptions.pvCosts > 0)) {
      reasons.push("Neem een 5 kW-warmtepomp en glas-op-glas-PV op, met afzonderlijke positieve kosten.");
    }
    circle = classifyRegion(assumptions);
    if (circle === null) reasons.push("Geen geldige cirkel: Gorinchem 50–60 km, Gooi/Randstad-transitiezone of Vlaanderen.");
    if (returns && !returns.yieldEligible) reasons.push("Bruto BAR ligt onder 7,5%.");
  }
  return { version: POLICY_VERSION, eligible: reasons.length === 0, reasons, circle,
    totalInvestment: returns?.totalInvestment ?? null,
    grossYieldPercent: returns?.grossYieldPercent ?? null,
    netYieldPercent: returns?.netYieldPercent ?? null,
    baselineHeatPumpKw: BASELINE_HEAT_PUMP_KW,
    regionVerification: "self-declared" as const };
}
