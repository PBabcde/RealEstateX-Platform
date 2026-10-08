import { analyseEnergy } from "./energy-analysis";

export type EnergyXSpecs = {
  woz: number | null;
  wwsPoints: number | null;
  wwsPointsGain: number | null;
  glazing: "enkel" | "dubbel" | "hr++" | "drievoudig" | null;
  heatingKw: number | null;
  coolingKw: number | null;
  roofAreaM2: number | null;
  connection: string | null;
};

export type SyncSnapshot = {
  adres: string;
  type: string;
  woonoppervlak: number;
  bouwjaar: number;
  energielabel: string;
  specs: EnergyXSpecs;
};

const WATT_PER_M2: Record<string, number> = {
  "A++++": 20, "A+++": 22, "A++": 25, "A+": 28, A: 32, B: 45, C: 60, D: 75, E: 90, F: 105, G: 120,
};
const GLAZING_FACTOR: Record<string, number> = { enkel: 1.25, dubbel: 1.1, "hr++": 1, drievoudig: 0.92 };
const KWH_PRICE = 0.27;
const KWH_PER_KWP = 900;
const PANEL_KWP = 0.4;
const PANEL_M2 = 1.7;

export function computeMetrics(snapshot: SyncSnapshot) {
  const { specs } = snapshot;
  const label = snapshot.energielabel.trim().toUpperCase();
  const analysis = analyseEnergy({
    energyLabel: label,
    woonoppervlak: snapshot.woonoppervlak,
    renovationCost: 0,
    expectedValue: specs.woz ?? 0,
  });
  const roofArea = specs.roofAreaM2 ?? Math.round(snapshot.woonoppervlak * 0.6);
  const panels = Math.max(0, Math.floor((roofArea * 0.6) / PANEL_M2));
  const solarKwp = Number((panels * PANEL_KWP).toFixed(1));
  const solarKwhYear = Math.round(solarKwp * KWH_PER_KWP);
  const heatingKw =
    specs.heatingKw ??
    Number(
      (
        (snapshot.woonoppervlak * (WATT_PER_M2[label] ?? 70) * (GLAZING_FACTOR[specs.glazing ?? "dubbel"] ?? 1)) /
        1000
      ).toFixed(1),
    );
  const coolingKw = specs.coolingKw ?? Number((snapshot.woonoppervlak * 0.05).toFixed(1));
  const batteryKwh = solarKwhYear > 0 ? Math.max(0, Math.round((solarKwhYear / 365) * 0.5)) : 0;
  const solarSavings = Math.round(solarKwhYear * 0.6 * KWH_PRICE);
  const annualSavings = analysis.annualSavings + solarSavings;
  const solarInvestment = Math.round(solarKwp * 1450);
  const heatPumpInvestment = Math.round(heatingKw * 1100 + 3500);
  const batteryInvestment = Math.round(batteryKwh * 650);
  const totalInvestment =
    solarInvestment + heatPumpInvestment + batteryInvestment + analysis.measures[0]!.investment;
  const paybackYears = annualSavings > 0 ? Number((totalInvestment / annualSavings).toFixed(1)) : null;
  return {
    sustainabilityScore: analysis.labelScore,
    solar: { panels, kwp: solarKwp, kwhPerYear: solarKwhYear, roofAreaM2: roofArea },
    heatPump: { heatingKw, coolingKw },
    battery: { kwh: batteryKwh },
    annualSavings,
    monthlySavings: Math.round(annualSavings / 12),
    paybackYears,
    investments: { solar: solarInvestment, heatPump: heatPumpInvestment, battery: batteryInvestment, insulation: analysis.measures[0]!.investment, total: totalInvestment },
    measures: analysis.measures,
  };
}

export type EnergyXMetrics = ReturnType<typeof computeMetrics>;

export function b2bView(snapshot: SyncSnapshot, metrics: EnergyXMetrics, syncedAt: string) {
  const comfort = metrics.sustainabilityScore >= 75 ? "hoog" : "verbeterpotentieel";
  return {
    view: "b2b" as const,
    syncedAt,
    building: {
      type: snapshot.type,
      areaM2: snapshot.woonoppervlak,
      buildYear: snapshot.bouwjaar,
      energyLabel: snapshot.energielabel,
    },
    specs: {
      ...snapshot.specs,
      wwsPointsGain: snapshot.specs.wwsPointsGain ?? null,
      heatingKw: metrics.heatPump.heatingKw,
      coolingKw: metrics.heatPump.coolingKw,
      roofAreaM2: metrics.solar.roofAreaM2,
    },
    metrics,
    technicalReport: {
      summary: `Label ${snapshot.energielabel}, ${snapshot.woonoppervlak} m², bouwjaar ${snapshot.bouwjaar}. Indicatieve dimensionering op basis van label, glastype en oppervlak.`,
      comfortLevel: comfort,
    },
    maintenance: {
      status: snapshot.bouwjaar < 1990 ? "inspectie aanbevolen" : "geen actie nodig",
      nextCheck: snapshot.bouwjaar < 1990 ? "binnen 6 maanden" : "binnen 24 maanden",
    },
    quoteIndication: {
      min: Math.round(metrics.investments.total * 0.9),
      max: Math.round(metrics.investments.total * 1.15),
      currency: "EUR",
    },
  };
}

export function b2cView(snapshot: SyncSnapshot, metrics: EnergyXMetrics, syncedAt: string) {
  return {
    view: "b2c" as const,
    syncedAt,
    monthlySavingsEur: metrics.monthlySavings,
    sustainabilityScore: metrics.sustainabilityScore,
    comfortImprovement:
      metrics.sustainabilityScore >= 75
        ? "Je woning presteert al goed; kleine verbeteringen houden het comfort stabiel."
        : "Betere isolatie en een efficiënte warmtepomp zorgen voor een gelijkmatiger en aangenamer binnenklimaat.",
    paybackYears: metrics.paybackYears,
    serviceRequestAvailable: true,
  };
}
