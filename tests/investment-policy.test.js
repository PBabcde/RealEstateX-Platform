import assert from "node:assert/strict";
import { test } from "node:test";
import { assessInvestment, calculateReturns, classifyRegion } from "../lib/investment-policy/src/index.ts";
import { calculateDealScore } from "../artifacts/api-server/src/lib/deal-score.ts";
import { calculateNetRoi } from "../artifacts/api-server/src/lib/subsidy-engine.ts";
import { createInvestorReadySheet } from "../artifacts/api-server/src/lib/investor-ready-sheet.ts";
import { analyseEnergy } from "../artifacts/api-server/src/lib/energy-analysis.ts";
import { calculateRental } from "../artifacts/api-server/src/lib/realestatex-modules.ts";

const assumptions = { acquisitionCosts: 10000, heatPumpCosts: 9000, pvCosts: 6000,
  heatPumpKw: 5, glassGlassPv: true, vacancyPercent: 10, annualOperatingCosts: 3000,
  region: "gorinchem", radiusKm: 60, distanceKm: 60 };
const base = { askingPrice: 150000, renovationCost: 25000, monthlyRent: 1250 };
test("exactly 7.5% gross passes even when net yield is lower; a cent below fails", () => {
  const result = assessInvestment(base, assumptions);
  assert.equal(result.totalInvestment, 200000);
  assert.equal(result.grossYieldPercent, 7.5);
  assert.equal(result.netYieldPercent, 5.25);
  assert.equal(result.eligible, true);
  assert.equal(assessInvestment({...base, monthlyRent: 1249.99}, assumptions).eligible, false);
  assert.equal(assessInvestment(base, {...assumptions, vacancyPercent: 100}).eligible, true);
});
test("three circles are distinct, including exact distance and radius boundaries", () => {
  assert.equal(classifyRegion(assumptions), 1);
  assert.equal(classifyRegion({...assumptions, distanceKm: 60.001}), null);
  assert.equal(classifyRegion({...assumptions, radiusKm: 70}), null);
  assert.equal(classifyRegion({...assumptions, radiusKm: 50, distanceKm: 50}), 1);
  assert.equal(classifyRegion({...assumptions, region: "gooi", distanceKm: 200}), 2);
  assert.equal(classifyRegion({...assumptions, region: "vlaanderen"}), 3);
  assert.equal(classifyRegion({...assumptions, region: "outside"}), null);
});
test("missing costs, wrong capacity and non-glass-glass PV never approve", () => {
  assert.equal(assessInvestment(base).eligible, false);
  for (const patch of [{heatPumpKw: 6}, {glassGlassPv: false}, {heatPumpCosts: 0},
    {pvCosts: 0}, {acquisitionCosts: NaN}, {annualOperatingCosts: -1}]) {
    assert.equal(assessInvestment(base, {...assumptions, ...patch}).eligible, false);
  }
});
test("score and subsidies or expected value cannot override the gross BAR gate", () => {
  const input = {...base, energyScore: 100, subsidyAmount: 100000, expectedValue: 900000,
    investmentAssumptions: assumptions, transformationPotential: 100};
  assert.equal(calculateDealScore(input).decision, "GO");
  assert.equal(calculateDealScore({...input, monthlyRent: 1249.99}).decision, "HOLD");
  assert.equal(calculateDealScore({...input, investmentAssumptions: undefined}).decision, "HOLD");
  assert.equal(calculateDealScore(input).grossYield, 7.5);
  const roi = calculateNetRoi({...input, ...assumptions});
  assert.equal(roi.totalInvestment, 200000);
});
test("report, deal score and quick calculator use the identical investment denominator", () => {
  const score = calculateDealScore({...base, expectedValue: 400000, energyScore: 100,
    subsidyAmount: 0, investmentAssumptions: assumptions});
  const deal = {...base, title: "Test", region: "Gorinchem", energyLabel: "A",
    woonoppervlak: 80, expectedValue: 400000, score, investmentAssumptions: assumptions};
  const energy = analyseEnergy(deal);
  const pdf = createInvestorReadySheet({deal, energy, subsidies: []}).toString();
  assert.ok(pdf.includes("Bruto BAR: 7.50%"));
  assert.ok(pdf.includes("Netto huurrendement: 5.25%"));
  assert.ok(pdf.includes("Totale investering: EUR 200000.00"));
  assert.ok(pdf.includes("Cirkel 1"));
  assert.ok(pdf.includes("GEHAALD"));
  assert.equal(calculateRental({huurprijs: 1250, kosten: 3000, investering: 200000}).grossYield, score.grossYield);
  assert.equal(calculateRental({huurprijs: 1250, kosten: 3000, investering: 200000}).netYield, 6);
  assert.equal(calculateRental({huurprijs: 1249.99, kosten: 0, investering: 200000}).barEligible, false);
  assert.equal(calculateRental({huurprijs: 1250, kosten: 0}).barEligible, null);
  assert.equal(energy.measures.filter(m => m.name.includes("Warmtepomp")).length, 1);
  assert.equal(energy.measures.find(m => m.name.includes("Warmtepomp")).investment, 9000);
});
test("overflow and non-finite values fail rather than producing passing ratios", () => {
  assert.throws(() => calculateReturns({purchasePrice: Number.MAX_VALUE, acquisitionCosts: Number.MAX_VALUE,
    renovationCosts: 0, heatPumpCosts: 1, pvCosts: 1, monthlyRent: 1000, vacancyPercent: 0, annualOperatingCosts: 0}));
});
