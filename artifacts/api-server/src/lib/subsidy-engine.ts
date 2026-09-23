import type { EnergyAnalysis } from "./energy-analysis";

export type SubsidyTrigger = {
  code: string;
  name: string;
  reason: string;
  estimatedAmount: number;
};

export function calculateSubsidies(input: {
  renovationCost: number;
  energy: EnergyAnalysis;
  municipality?: string;
}): { triggers: SubsidyTrigger[]; totalEstimatedAmount: number } {
  const triggers: SubsidyTrigger[] = [];
  if (input.energy.labelScore < 80 && input.renovationCost >= 5_000) {
    triggers.push({
      code: "ISDE-ENERGY",
      name: "Energieverbetering",
      reason: "Energielabel en investering voldoen aan de interne ISDE-scan.",
      estimatedAmount: Math.min(7_500, Math.round(input.renovationCost * 0.12)),
    });
  }
  if (input.energy.measures.some((measure) => measure.name.includes("Isolatie"))) {
    triggers.push({
      code: "ISDE-INSULATION",
      name: "Isolatiemaatregelen",
      reason: "Isolatie staat als aanbevolen maatregel in de energiescan.",
      estimatedAmount: Math.min(4_000, Math.round(input.renovationCost * 0.08)),
    });
  }
  if (input.municipality?.trim()) {
    triggers.push({
      code: "LOCAL-REVIEW",
      name: "Gemeentelijke herziening",
      reason: `Controleer aanvullende regeling voor ${input.municipality.trim()}.`,
      estimatedAmount: 0,
    });
  }

  return {
    triggers,
    totalEstimatedAmount: triggers.reduce(
      (total, trigger) => total + trigger.estimatedAmount,
      0,
    ),
  };
}

export function calculateNetRoi(input: {
  askingPrice: number;
  renovationCost: number;
  expectedValue: number;
  subsidyAmount: number;
}): {
  totalInvestment: number;
  valueCreation: number;
  netRoi: number;
  revisedValue: number;
} {
  const totalInvestment = Math.max(
    0,
    input.askingPrice + input.renovationCost - input.subsidyAmount,
  );
  const valueCreation = input.expectedValue - totalInvestment;
  return {
    totalInvestment,
    valueCreation,
    netRoi:
      totalInvestment > 0
        ? Number(((valueCreation / totalInvestment) * 100).toFixed(2))
        : 0,
    revisedValue: input.expectedValue,
  };
}