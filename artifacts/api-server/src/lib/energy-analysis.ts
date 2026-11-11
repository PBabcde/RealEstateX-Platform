import { BASELINE_HEAT_PUMP_COST } from "@workspace/investment-policy";

export type EnergyAnalysisInput = {
  heatPumpCosts?: number;
  pvCosts?: number;
  energyLabel: string;
  woonoppervlak: number;
  renovationCost: number;
  expectedValue: number;
};

export type EnergyAnalysis = {
  currentLabel: string;
  labelScore: number;
  annualEnergyCost: number;
  annualSavings: number;
  paybackYears: number;
  revisedValue: number;
  measures: Array<{
    name: string;
    investment: number;
    annualSavings: number;
  }>;
};

const LABEL_SCORES: Record<string, number> = {
  "A++++": 100,
  "A+++": 98,
  "A++": 95,
  "A+": 92,
  A: 88,
  B: 76,
  C: 62,
  D: 48,
  E: 35,
  F: 24,
  G: 12,
};

export function analyseEnergy(input: EnergyAnalysisInput): EnergyAnalysis {
  const label = input.energyLabel.trim().toUpperCase();
  const labelScore = LABEL_SCORES[label] ?? 50;
  const baseCost = Math.max(0, Math.round(input.woonoppervlak * (120 - labelScore)));
  const measures = [
    ...(labelScore < 75 ? [
          {
            name: "Isolatie en kierdichting",
            investment: Math.round(input.woonoppervlak * 85),
            annualSavings: Math.round(input.woonoppervlak * 17),
          },
        ] : []),
    { name: "Warmtepomp 5 kW (rekenbaseline)",
      investment: input.heatPumpCosts ?? BASELINE_HEAT_PUMP_COST,
      annualSavings: labelScore < 75 ? 1150 : 0 },
    { name: "Glas-op-glas-zonnepanelen",
      investment: input.pvCosts ?? Math.round(input.woonoppervlak * 45),
      annualSavings: Math.round(input.woonoppervlak * 10) },
  ];
  const annualSavings = measures.reduce(
    (total, measure) => total + measure.annualSavings,
    0,
  );
  const improvementCost = measures.reduce(
    (total, measure) => total + measure.investment,
    0,
  );
  const paybackYears =
    annualSavings > 0 ? Number((improvementCost / annualSavings).toFixed(1)) : 0;

  return {
    currentLabel: label,
    labelScore,
    annualEnergyCost: baseCost,
    annualSavings,
    paybackYears,
    revisedValue: Math.round(
      input.expectedValue + Math.min(improvementCost * 1.15, input.expectedValue * 0.12),
    ),
    measures,
  };
}