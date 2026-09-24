export const TRAINING_QUALITY_GATE_MIN_SCORE = 80;

export function hasTrainingQualityGatePassed(score: number): boolean {
  return (
    Number.isFinite(score) &&
    score >= TRAINING_QUALITY_GATE_MIN_SCORE &&
    score <= 100
  );
}