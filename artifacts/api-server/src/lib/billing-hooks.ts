import { SAAS_TIERS, type SaaSTier } from "./saas-entitlements";

export type BillingProvider = "whop" | "unconfigured";

export type BillingReadiness = {
  provider: BillingProvider;
  configured: boolean;
  webhookReady: boolean;
  supportedTiers: SaaSTier[];
  message: string;
};

export function getBillingReadiness(): BillingReadiness {
  const configuredProvider = process.env.BILLING_PROVIDER?.toLowerCase();
  const provider: BillingProvider =
    configuredProvider === "whop"
      ? configuredProvider
      : "unconfigured";
  const configured = provider !== "unconfigured";
  return {
    provider,
    configured,
    webhookReady: configured && Boolean(process.env.BILLING_WEBHOOK_SECRET),
    supportedTiers: Object.keys(SAAS_TIERS) as SaaSTier[],
    message: configured
      ? "Provider-configuratie is aanwezig; webhook readiness wordt apart gecontroleerd."
      : "Kies een betaalprovider en configureer de provider via de secure environment flow.",
  };
}