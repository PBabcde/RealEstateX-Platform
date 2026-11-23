/**
 * User-specified baseline model. These are indicative fixed assumptions, not
 * measured savings, installation sizing or an investment-policy assessment.
 */
const labelScores = {
  "A++": 100, "A+": 95, A: 90, B: 80, C: 70,
  D: 60, E: 50, F: 40, G: 30,
} as const;

export class EnergyBrainInputError extends Error {}

export function calculateEnergyBrain(
  energielabel: string,
  bouwjaar: number,
  woonoppervlak: number,
) {
  const label = energielabel.trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(labelScores, label)) {
    throw new EnergyBrainInputError("Energy Brain ondersteunt energielabels G t/m A++.");
  }
  if (!Number.isInteger(bouwjaar) || bouwjaar < 1000 || bouwjaar > 2100 ||
      !Number.isFinite(woonoppervlak) || woonoppervlak < 1) {
    throw new EnergyBrainInputError("Bouwjaar en woonoppervlak moeten geldig zijn voor een Energy Brain-analyse.");
  }
  const measures = {
    G: ["Spouwmuurisolatie", 2500],
    F: ["Spouwmuurisolatie", 2500],
    E: ["Spouwmuurisolatie", 2500],
    D: ["HR++ glas", 4500],
    C: ["HR++ glas", 4500],
    B: ["Warmtepomp voorbereiding", 6000],
    A: ["Zonnepanelen optimalisatie", 3500],
    "A+": ["Batterijopslag advies", 7000],
    "A++": ["Netcongestie optimalisatie", 3000],
  } as const;
  const supportedLabel = label as keyof typeof labelScores;
  const [recommended_measure, estimated_investment] = measures[supportedLabel];
  const estimated_annual_saving = Math.round(estimated_investment * 0.18 * 100) / 100;
  return {
    energy_score: labelScores[supportedLabel],
    recommended_measure,
    estimated_investment,
    estimated_annual_saving,
    payback_years: Math.round(estimated_investment / estimated_annual_saving * 100) / 100,
    indicative: true as const,
    methodology: "Indicatief labelmodel: jaarlijkse besparing = 18% van de vaste investering. Bouwjaar en oppervlak zijn gevalideerd maar wegen niet mee. Geen energieprestatieberekening, installatieadvies of investeringsgoedkeuring.",
  };
}
