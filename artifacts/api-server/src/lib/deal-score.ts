export type DealScoreInput = {
  askingPrice: number;
  renovationCost: number;
  expectedValue: number;
  monthlyRent: number;
  energyScore: number;
  subsidyAmount: number;
  transformationPotential?: number;
};

export type DealScore = {
  flitsScore: number;
  splitScore: number;
  transformationScore: number;
  energyScore: number;
  subsidyScore: number;
  totalScore: number;
  decision: "GO" | "HOLD" | "REJECT";
  margin: number;
  grossYield: number;
};

const clamp = (value: number, minimum = 0, maximum = 100): number =>
  Math.max(minimum, Math.min(maximum, Math.round(value)));

export function calculateDealScore(input: DealScoreInput): DealScore {
  const margin = input.expectedValue - input.askingPrice - input.renovationCost;
  const marginRate = input.askingPrice > 0 ? (margin / input.askingPrice) * 100 : 0;
  const grossYield =
    input.expectedValue > 0
      ? ((input.monthlyRent * 12) / input.expectedValue) * 100
      : 0;

  const flitsScore = clamp(50 + marginRate * 2.2);
  const splitScore = clamp(
    86 - (input.renovationCost / Math.max(input.askingPrice, 1)) * 100,
  );
  const transformationScore = clamp(
    input.transformationPotential ?? 55 + marginRate,
  );
  const energyScore = clamp(input.energyScore);
  const subsidyScore = clamp(
    input.renovationCost > 0
      ? 45 + (input.subsidyAmount / input.renovationCost) * 100
      : 30,
  );
  const totalScore = clamp(
    flitsScore * 0.3 +
      splitScore * 0.15 +
      transformationScore * 0.15 +
      energyScore * 0.2 +
      subsidyScore * 0.2,
  );

  return {
    flitsScore,
    splitScore,
    transformationScore,
    energyScore,
    subsidyScore,
    totalScore,
    decision: totalScore >= 70 ? "GO" : totalScore >= 50 ? "HOLD" : "REJECT",
    margin: Math.round(margin),
    grossYield: Number(grossYield.toFixed(2)),
  };
}