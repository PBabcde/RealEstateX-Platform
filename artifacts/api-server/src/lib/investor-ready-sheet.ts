import type { DealRecord } from "./enterprise-modules";
import type { EnergyAnalysis } from "./energy-analysis";
import type { SubsidyTrigger } from "./subsidy-engine";

function escapePdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

export function createInvestorReadySheet(input: {
  deal: DealRecord;
  energy: EnergyAnalysis;
  subsidies: SubsidyTrigger[];
}): Buffer {
  const gutFeelingLines = input.deal.gutFeeling
    ? [
        `Gut Feeling: ${input.deal.score.gutFeelingScore ?? "—"}/100`,
        `Gut Feeling vertrouwen: ${input.deal.score.gutFeelingConfidence}%`,
        `Gut Feeling bijdrage aan Deal Score: ${input.deal.score.gutFeelingContribution >= 0 ? "+" : ""}${input.deal.score.gutFeelingContribution} punten`,
        `Nieuwsbronnen: ${input.deal.gutFeeling.sourceCount}`,
        `Sentiment gemeten: ${input.deal.gutFeeling.observedAt}`,
        `Sentiment vervalt na: ${input.deal.gutFeeling.staleAt}`,
      ]
    : ["Gut Feeling: geen recent sentimentsignaal; bijdrage 0 punten"];
  const lines = [
    "RealEstateX Investor Ready Sheet",
    `Deal: ${input.deal.title}`,
    `Regio: ${input.deal.region}`,
    `Vraagprijs: EUR ${input.deal.askingPrice.toLocaleString("nl-NL")}`,
    `Verwachte waarde: EUR ${input.deal.expectedValue.toLocaleString("nl-NL")}`,
    `Deal score: ${input.deal.score.totalScore}/100 (${input.deal.score.decision})`,
    ...gutFeelingLines,
    `Energie: ${input.energy.currentLabel}, jaarlijkse besparing EUR ${input.energy.annualSavings.toLocaleString("nl-NL")}`,
    `Subsidies: EUR ${input.subsidies.reduce((sum, item) => sum + item.estimatedAmount, 0).toLocaleString("nl-NL")}`,
    `Netto marge: EUR ${input.deal.score.margin.toLocaleString("nl-NL")}`,
    "",
    "Deze export is een indicatief investeringsmemorandum en geen financieel advies.",
  ];
  const stream = [
    "BT",
    "/F1 12 Tf",
    "50 760 Td",
    ...lines.map((line, index) =>
      index === 0
        ? `(${escapePdfText(line)}) Tj`
        : `0 -22 Td (${escapePdfText(line)}) Tj`,
    ),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}