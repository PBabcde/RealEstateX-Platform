export const SAAS_TIERS = {
  STARTER: {
    label: "Starter",
    maxProperties: 10,
    maxInvestors: 25,
    features: ["portfolio", "basic-energy"],
  },
  PROFESSIONAL: {
    label: "Professional",
    maxProperties: 100,
    maxInvestors: 250,
    features: ["portfolio", "dealing-room", "energy", "subsidies", "crm"],
  },
  INVESTOR: {
    label: "Investor",
    maxProperties: 500,
    maxInvestors: 1_000,
    features: ["dealing-room", "investor-room", "matching", "crm", "exports"],
  },
  ENTERPRISE: {
    label: "Enterprise",
    maxProperties: Number.POSITIVE_INFINITY,
    maxInvestors: Number.POSITIVE_INFINITY,
    features: [
      "portfolio",
      "dealing-room",
      "energy",
      "subsidies",
      "investor-room",
      "matching",
      "crm",
      "exports",
      "audit",
      "tenant-isolation",
    ],
  },
} as const;

export type SaaSTier = keyof typeof SAAS_TIERS;

export function getSaaSEntitlements(tier: SaaSTier = "PROFESSIONAL") {
  const selected = SAAS_TIERS[tier];
  return {
    tier,
    ...selected,
  };
}

export function hasSaaSFeature(
  tier: SaaSTier,
  feature: string,
): boolean {
  return (SAAS_TIERS[tier].features as readonly string[]).includes(feature);
}