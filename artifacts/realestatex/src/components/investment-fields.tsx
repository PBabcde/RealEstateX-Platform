import type { InvestmentAssumptions, InvestmentAssessment } from "@workspace/api-client-react";
import { BASELINE_HEAT_PUMP_KW } from "@workspace/investment-policy";

export const emptyInvestmentAssumptions = (): InvestmentAssumptions => ({
  acquisitionCosts: 0, heatPumpCosts: 0, pvCosts: 0, heatPumpKw: BASELINE_HEAT_PUMP_KW,
  glassGlassPv: true, vacancyPercent: 0, annualOperatingCosts: 0,
  region: "outside", radiusKm: 60, distanceKm: 0,
});

/** Extra fields inside existing deal/scenario forms, not a new screen. */
export function InvestmentFields({ value, onChange }: {
  value?: InvestmentAssumptions;
  onChange: (value: InvestmentAssumptions) => void;
}) {
  const current = value ?? emptyInvestmentAssumptions();
  const change = (patch: Partial<InvestmentAssumptions>) => onChange({ ...current, ...patch });
  const fields = [
    ["acquisitionCosts", "Aankoopkosten (€)", 0],
    ["heatPumpCosts", "5 kW-warmtepomp, geïnstalleerd (€)", 0.01],
    ["pvCosts", "Glas-op-glas-PV, geïnstalleerd (€)", 0.01],
    ["vacancyPercent", "Leegstand (%)", 0],
    ["annualOperatingCosts", "Exploitatiekosten per jaar (€)", 0],
  ] as const;
  return <fieldset className="my-4 space-y-3 rounded-xl border border-border p-4">
    <legend className="px-1 text-xs font-bold">Gezamenlijke investeringstoets</legend>
    <p className="text-xs text-muted-foreground">Bruto BAR ≥ 7,5%. Grondslag: aankoop + aankoopkosten + renovatie exclusief kit + warmtepomp + PV. Geen aftrek van subsidies. Controleer ook de standaardwaarden van 0.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(([key, label, min]) => <label key={key} className="text-xs font-semibold">{label}
        <input required type="number" step="0.01" min={min} max={key === "vacancyPercent" ? 100 : undefined}
          value={current[key]} onChange={event => change({ [key]: Number(event.target.value) })}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" data-testid={`investment-${key}`} />
      </label>)}
      <label className="text-xs font-semibold">Regio (handmatige opgave)
        <select value={current.region} onChange={event => change({ region: event.target.value as InvestmentAssumptions["region"] })}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" data-testid="investment-region">
          <option value="outside">Geen cirkel / nog te bepalen</option>
          <option value="gorinchem">Cirkel 1 — Gorinchem, 50–60 km</option>
          <option value="gooi">Cirkel 2 — Gooi / Randstad-transitiezones</option>
          <option value="vlaanderen">Cirkel 3 — Vlaanderen</option>
        </select>
      </label>
      {current.region === "gorinchem" && <>
        <label className="text-xs font-semibold">Straal Gorinchem (50–60 km)<input required type="number" min="50" max="60" step="0.01" value={current.radiusKm} onChange={event => change({ radiusKm: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" /></label>
        <label className="text-xs font-semibold">Hemelsbrede afstand (km)<input required type="number" min="0" step="0.01" value={current.distanceKm} onChange={event => change({ distanceKm: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" /></label>
      </>}
      <label className="text-xs font-semibold">Warmtepompbaseline (kW)<input required type="number" min="5" max="5" value={current.heatPumpKw} onChange={event => change({ heatPumpKw: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" /></label>
    </div>
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={current.glassGlassPv} onChange={event => change({ glassGlassPv: event.target.checked })} /> Glas-op-glas-zonnepanelen opgenomen in de afzonderlijke PV-kosten.</label>
    <p className="text-xs text-muted-foreground">Regio en afstand zijn niet geografisch geverifieerd. De 5 kW-baseline vervangt geen dimensionering door een installateur. Deze toets is geen WWS- of juridische goedkeuring.</p>
  </fieldset>;
}

export function InvestmentResult({ assessment }: { assessment?: InvestmentAssessment }) {
  if (!assessment) return <p className="text-xs text-amber-800">Investeringstoets ontbreekt; vul de aannames aan.</p>;
  const percent = (value: number | null) => value === null ? "Onbekend" : `${value.toLocaleString("nl-NL", {maximumFractionDigits: 2})}%`;
  return <div className="my-3 rounded-xl border border-border p-3 text-xs" data-testid="investment-result">
    <p className="font-bold">{assessment.eligible ? "Investeringstoets gehaald" : "Investeringstoets niet gehaald"}</p>
    <p className="mt-1">Bruto BAR: {percent(assessment.grossYieldPercent)} · Netto huurrendement: {percent(assessment.netYieldPercent)}</p>
    <p>Totale investering: {assessment.totalInvestment === null ? "onbekend" : `€ ${assessment.totalInvestment.toLocaleString("nl-NL")}`} · {assessment.circle ? `Cirkel ${assessment.circle}` : "geen cirkel"}</p>
    {assessment.reasons.length > 0 && <ul className="mt-2 list-disc pl-4">{assessment.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
    <p className="mt-2 text-muted-foreground">Baseline 5 kW + glas-op-glas-PV. Regio zelf opgegeven; geen geografische, WWS- of juridische verificatie.</p>
  </div>;
}
