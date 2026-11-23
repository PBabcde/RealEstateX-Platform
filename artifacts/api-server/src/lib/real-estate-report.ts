import type { Property } from "@workspace/api-zod";
import { calculateEnergyBrain } from "./energy-brain";

type RealEstateReportProperty = Pick<
  Property,
  | "propertyId"
  | "naam"
  | "adres"
  | "postcode"
  | "plaats"
  | "bouwjaar"
  | "woonoppervlak"
  | "energielabel"
  | "huurprijs"
  | "marktwaarde"
>;

export function generateRealEstateReport(property: RealEstateReportProperty) {
  const energy = calculateEnergyBrain(
    property.energielabel,
    property.bouwjaar,
    property.woonoppervlak,
  );
  const hasProfitabilityInputs =
    typeof property.huurprijs === "number" &&
    Number.isFinite(property.huurprijs) &&
    property.huurprijs >= 0 &&
    typeof property.marktwaarde === "number" &&
    Number.isFinite(property.marktwaarde) &&
    property.marktwaarde > 0;
  const rentCents = hasProfitabilityInputs
    ? BigInt(Math.round(property.huurprijs! * 100))
    : null;
  const marketValueCents = hasProfitabilityInputs
    ? BigInt(Math.round(property.marktwaarde! * 100))
    : null;
  const grossYieldNumerator = rentCents === null ? null : rentCents * 1200n;
  const grossYield = grossYieldNumerator === null || marketValueCents === null
    ? null
    : Math.round(Number(grossYieldNumerator) / Number(marketValueCents) * 100) / 100;
  const classification = grossYieldNumerator === null || marketValueCents === null
    ? "Onvoldoende gegevens"
    : grossYieldNumerator < marketValueCents * 4n
      ? "Laag"
      : grossYieldNumerator <= marketValueCents * 7n
        ? "Gemiddeld"
        : "Sterk";
  const recommendation = energy.energy_score < 70
    ? "Verduurzaming aanbevolen"
    : energy.energy_score <= 90
      ? "Optimalisatie aanbevolen"
      : "Hoogwaardig vastgoedprofiel";

  return {
    property: {
      property_id: property.propertyId,
      name: property.naam ?? null,
      address: property.adres,
      postcode: property.postcode ?? null,
      city: property.plaats ?? null,
      construction_year: property.bouwjaar,
      living_area_m2: property.woonoppervlak,
      energy_label: property.energielabel,
      monthly_rent_eur: property.huurprijs ?? null,
      market_value_eur: property.marktwaarde ?? null,
    },
    energy_brain: {
      score: energy.energy_score,
      recommended_measure: energy.recommended_measure,
      estimated_investment_eur: energy.estimated_investment,
      estimated_annual_saving_eur: energy.estimated_annual_saving,
      payback_years: energy.payback_years,
      indicative: true as const,
    },
    profitability: {
      gross_yield_percent: grossYield,
      classification,
      basis: "Jaarhuur / opgegeven marktwaarde",
      note: grossYield === null
        ? "Vul een geldige huurprijs en marktwaarde in om dit percentage te berekenen."
        : "Dit is rendement op marktwaarde. Het is niet de BAR op totale investering uit de RealEstateX-beleidscontrole.",
    },
    recommendation,
    disclaimer: "Dit rapport is een indicatieve momentopname op basis van de opgeslagen dossiergegevens en de Energy Brain-baseline. Het is geen taxatie, energieprestatieberekening, installatieadvies of formele investeringsgoedkeuring. Voor GO/NO-GO geldt de afzonderlijke RealEstateX-investeringstoets.",
    generated_at: new Date().toISOString(),
  };
}
