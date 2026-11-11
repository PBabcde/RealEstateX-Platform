import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMetrics } from "../artifacts/api-server/src/lib/energyx-metrics.ts";

function snapshot(energielabel, roofAreaM2 = 80) {
  return { adres: "Voorbeeld", type: "Appartement", woonoppervlak: 100, bouwjaar: 1985,
    energielabel, specs: { woz: null, wwsPoints: null, wwsPointsGain: null,
      glazing: "dubbel", heatingKw: null, coolingKw: null, roofAreaM2, connection: null } };
}

for (const label of ["D", "B", "A", "A++++"]) {
  test(`label ${label}: every measure contributes to investment and savings once`, () => {
    const r = computeMetrics(snapshot(label));
    assert.equal(r.measures.filter((m) => m.name === "Glas-op-glas-zonnepanelen").length, 1);
    assert.equal(r.heatPump.capacityKw, 5);
    assert.equal(r.investments.heatPump, 9000);
    assert.equal(r.investments.total, r.measures.reduce((total, m) => total + m.investment, 0));
    assert.equal(r.annualSavings, r.measures.reduce((total, m) => total + m.annualSavings, 0));
    assert.equal(r.investments.total, r.investments.solar + r.investments.heatPump + r.investments.battery + r.investments.insulation);
    const solar = r.measures.find((m) => m.name === "Glas-op-glas-zonnepanelen");
    assert.equal(solar.investment, Math.round(r.solar.kwp * 1450));
    assert.equal(solar.annualSavings, Math.round(r.solar.kwhPerYear * 0.6 * 0.27));
    if (label !== "D") {
      assert.equal(r.investments.insulation, 0);
      assert.equal(r.annualSavings, solar.annualSavings);
    }
    assert.equal(r.paybackYears, Number((r.investments.total / r.annualSavings).toFixed(1)));
  });
}

test("a high-label property without roof capacity has no generic solar savings or solar investment", () => {
  const r = computeMetrics(snapshot("A", 0));
  assert.equal(r.solar.kwp, 0);
  assert.equal(r.investments.solar, 0);
  assert.equal(r.investments.insulation, 0);
  assert.equal(r.annualSavings, 0);
  assert.equal(r.paybackYears, null);
});
