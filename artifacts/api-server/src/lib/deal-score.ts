import { assessInvestment, type InvestmentAssumptions } from "@workspace/investment-policy";

export type DealScoreInput = {
  investmentAssumptions?: InvestmentAssumptions;
  askingPrice: number;
  renovationCost: number;
  expectedValue: number;
  monthlyRent: number;
  energyScore: number;
  subsidyAmount: number;
  transformationPotential?: number;
  gutFeelingScore?: number | null;
  gutFeelingConfidence?: number;
};

export type DealScore = {
  assessment?: ReturnType<typeof assessInvestment>;
  flitsScore: number;
  splitScore: number;
  transformationScore: number;
  energyScore: number;
  subsidyScore: number;
  totalScore: number;
  decision: "GO" | "HOLD" | "REJECT";
  margin: number;
  grossYield: number;
  gutFeelingScore: number | null;
  gutFeelingConfidence: number;
  gutFeelingContribution: number;
};

const clamp = (value: number, minimum = 0, maximum = 100): number =>
  Math.max(minimum, Math.min(maximum, Math.round(value)));

export function calculateDealScore(input: DealScoreInput): DealScore {
  const assessment = assessInvestment(input, input.investmentAssumptions);
  const margin = input.expectedValue - (assessment.totalInvestment ?? (input.askingPrice + input.renovationCost));
  const marginRate = input.askingPrice > 0 ? (margin / input.askingPrice) * 100 : 0;
  const grossYield = assessment.grossYieldPercent ?? 0;

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
  const objectiveScore =
    flitsScore * 0.3 +
      splitScore * 0.15 +
      transformationScore * 0.15 +
      energyScore * 0.2 +
      subsidyScore * 0.2;
  const gutFeelingScore =
    input.gutFeelingScore == null ? null : clamp(input.gutFeelingScore);
  const gutFeelingConfidence =
    gutFeelingScore === null ? 0 : clamp(input.gutFeelingConfidence ?? 100);
  const gutFeelingWeight =
    gutFeelingScore === null ? 0 : 0.1 * (gutFeelingConfidence / 100);
  const totalScore = clamp(
    objectiveScore * (1 - gutFeelingWeight) +
      (gutFeelingScore ?? objectiveScore) * gutFeelingWeight,
  );
  const gutFeelingContribution = Number(
    (((gutFeelingScore ?? objectiveScore) - objectiveScore) * gutFeelingWeight).toFixed(2),
  );

  return {
    assessment,
    flitsScore,
    splitScore,
    transformationScore,
    energyScore,
    subsidyScore,
    totalScore,
    decision: totalScore >= 70 && assessment.eligible ? "GO" : totalScore >= 50 ? "HOLD" : "REJECT",
    margin: Math.round(margin),
    grossYield: Number(grossYield.toFixed(2)),
    gutFeelingScore,
    gutFeelingConfidence,
    gutFeelingContribution,
  };
}