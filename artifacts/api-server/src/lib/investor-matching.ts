import type { DealRecord, InvestorRecord } from "./enterprise-modules";

export type InvestorMatch = InvestorRecord & {
  matchScore: number;
  reasons: string[];
};

export function matchInvestors(
  deal: DealRecord,
  investors: InvestorRecord[],
): InvestorMatch[] {
  return investors
    .map((investor) => {
      let score = 0;
      const reasons: string[] = [];
      if (
        deal.expectedValue >= investor.budgetMin &&
        deal.expectedValue <= investor.budgetMax
      ) {
        score += 45;
        reasons.push("binnen budget");
      } else if (deal.expectedValue <= investor.budgetMax * 1.15) {
        score += 20;
        reasons.push("budget bijna passend");
      }
      if (investor.preferredRegions.length === 0) {
        score += 15;
      } else if (
        investor.preferredRegions.some((region) =>
          deal.region.toLowerCase().includes(region.toLowerCase()),
        )
      ) {
        score += 25;
        reasons.push("regio past");
      }
      if (
        investor.riskProfile === "HIGH" ||
        (investor.riskProfile === "MEDIUM" && deal.score.totalScore >= 55) ||
        (investor.riskProfile === "LOW" && deal.score.totalScore >= 75)
      ) {
        score += 20;
        reasons.push("risicoprofiel past");
      }
      if (investor.interests.length === 0) {
        score += 10;
      } else if (
        investor.interests.some((interest) =>
          `${deal.title} ${deal.propertyType}`
            .toLowerCase()
            .includes(interest.toLowerCase()),
        )
      ) {
        score += 15;
        reasons.push("interesse past");
      }
      return {
        ...investor,
        matchScore: Math.min(100, score),
        reasons,
      };
    })
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, 10);
}