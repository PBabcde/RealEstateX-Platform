import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { generateRealEstateReport } from "../artifacts/api-server/src/lib/real-estate-report.ts";
import { renderRealEstateReportPdf } from "../artifacts/api-server/src/lib/real-estate-report-pdf.ts";

function property(overrides = {}) {
  return {
    propertyId: "report-test-1",
    ownerId: "owner-1",
    naam: "Testpand",
    adres: "Voorbeeldstraat 8",
    postcode: "1234 AB",
    plaats: "Utrecht",
    type: "Appartement",
    bouwjaar: 1990,
    woonoppervlak: 80,
    energielabel: "B",
    huurprijs: 1250,
    marktwaarde: 300000,
    ...overrides,
  };
}

test("report calculates yield thresholds precisely and labels its denominator", () => {
  const cases = [
    [3.99, 100, 120000 / 3.99, "Laag"],
    [4, 100, 120000 / 3.999, "Laag"],
    [4, 100, 120000 / 4, "Gemiddeld"],
    [7, 100, 120000 / 7, "Gemiddeld"],
    [7.01, 100, 120000 / 7.01, "Sterk"],
  ];
  for (const [expected, monthlyRent, marketValue, classification] of cases) {
    const report = generateRealEstateReport(property({ huurprijs: monthlyRent, marktwaarde: marketValue }));
    assert.equal(report.profitability.gross_yield_percent, expected);
    assert.equal(report.profitability.classification, classification);
    assert.match(report.profitability.basis, /marktwaarde/);
  }
});

test("report indicates missing inputs instead of inventing a yield", () => {
  for (const values of [
    { huurprijs: null, marktwaarde: 300000 },
    { huurprijs: 1000, marktwaarde: null },
    { huurprijs: 1000, marktwaarde: 0 },
  ]) {
    const report = generateRealEstateReport(property(values));
    assert.equal(report.profitability.gross_yield_percent, null);
    assert.equal(report.profitability.classification, "Onvoldoende gegevens");
    assert.match(report.profitability.note, /Vul een geldige huurprijs/);
  }
});

test("energy recommendations respect the documented score bands", () => {
  for (const [label, recommendation] of [
    ["C", "Optimalisatie aanbevolen"],
    ["B", "Optimalisatie aanbevolen"],
    ["A", "Optimalisatie aanbevolen"],
    ["A+", "Hoogwaardig vastgoedprofiel"],
    ["D", "Verduurzaming aanbevolen"],
  ]) {
    assert.equal(generateRealEstateReport(property({ energielabel: label })).recommendation, recommendation);
  }
  const report = generateRealEstateReport(property());
  assert.match(report.disclaimer, /geen taxatie/);
  assert.match(report.profitability.note, /niet de BAR op totale investering/);
});

test("PDF contains all seven report sections and a valid PDF signature", async () => {
  const report = generateRealEstateReport(property());
  const pdf = await renderRealEstateReportPdf(report);
  assert.equal(pdf.toString("latin1", 0, 8), "%PDF-1.3");
  const source = execFileSync("pdftotext", ["-", "-"], { input: pdf, encoding: "utf8" });
  for (const section of [
    "Vastgoedrapport", "1. Vastgoedobject", "2. Financiële analyse",
    "3. Energy Brain-analyse", "4. Aanbevolen maatregel",
    "5. Geschatte jaarlijkse besparing", "6. Indicatieve terugverdientijd",
    "7. Eindconclusie", "Voorbeeldstraat 8",
  ]) assert.ok(source.includes(section), `PDF missing section or property text: ${section}`);
});
