import PDFDocument from "pdfkit";
import type { PropertyReport } from "@workspace/api-zod";

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const decimal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });

function money(value: number | null): string {
  return value === null ? "Niet opgegeven" : euro.format(value);
}

export async function renderRealEstateReportPdf(report: PropertyReport): Promise<Buffer> {
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 52, right: 52, bottom: 55, left: 52 },
    compress: false,
    info: {
      Title: `RealEstateX rapport - ${report.property.name ?? report.property.address}`,
      Author: "RealEstateX",
      Subject: "Vastgoed- en Energy Brain rapport",
    },
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const navy = "#17344D";
  const teal = "#087F8C";
  const muted = "#526273";
  const pageWidth = document.page.width - 104;

  document.rect(0, 0, document.page.width, 150).fill(navy);
  document.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10)
    .text("REAL ESTATEX  /  VASTGOEDRAPPORT", 52, 44, { characterSpacing: 1.3 });
  document.fontSize(25).text("Vastgoedrapport", 52, 70);
  document.fillColor("#D7E5EC").font("Helvetica").fontSize(10)
    .text(`Gegenereerd ${new Date(report.generated_at).toLocaleDateString("nl-NL")}`, 52, 112);
  document.y = 178;

  const section = (title: string) => {
    document.moveDown(0.7);
    document.fillColor(teal).font("Helvetica-Bold").fontSize(14).text(title, 52);
    const y = document.y + 5;
    document.moveTo(52, y).lineTo(52 + pageWidth, y).strokeColor("#D8E2E8").lineWidth(1).stroke();
    document.moveDown(0.55);
    document.fillColor("#263746").font("Helvetica").fontSize(10);
  };
  const paragraph = (text: string, size: number, color: string, lineGap = 2) => {
    document.fillColor(color).font("Helvetica").fontSize(size);
    const options = { width: pageWidth, lineGap };
    const height = document.heightOfString(text, options);
    const y = document.y;
    document.text(text, 52, y, options);
    document.y = y + height + 5;
    document.x = 52;
  };
  const row = (label: string, value: string) => {
    const y = document.y;
    const labelOptions = { width: 195, lineGap: 2 };
    const valueOptions = { width: 280, lineGap: 2 };
    const labelHeight = document.heightOfString(label, labelOptions);
    const valueHeight = document.heightOfString(value, valueOptions);
    document.fillColor(muted).font("Helvetica").fontSize(10).text(label, 52, y, labelOptions);
    document.fillColor("#172B3A").font("Helvetica-Bold").fontSize(10)
      .text(value, 260, y, valueOptions);
    document.y = y + Math.max(labelHeight, valueHeight) + 6;
    document.font("Helvetica").fillColor("#263746");
  };

  section("1. Vastgoedobject");
  row("Naam", report.property.name ?? "Niet opgegeven");
  row("Adres", report.property.address);
  row("Postcode en plaats", [report.property.postcode, report.property.city].filter(Boolean).join(" ") || "Niet opgegeven");
  row("Bouwjaar", String(report.property.construction_year));
  row("Woonoppervlakte", `${decimal.format(report.property.living_area_m2)} m²`);
  row("Energielabel", report.property.energy_label);

  section("2. Financiële analyse");
  row("Maandelijkse huur", money(report.property.monthly_rent_eur));
  row("Opgegeven marktwaarde", money(report.property.market_value_eur));
  row(
    "Bruto rendement op marktwaarde",
    report.profitability.gross_yield_percent === null
      ? "Niet berekenbaar"
      : `${decimal.format(report.profitability.gross_yield_percent)}% · ${report.profitability.classification}`,
  );
  row("Berekeningsbasis", report.profitability.basis);
  paragraph(report.profitability.note, 9, muted);

  section("3. Energy Brain-analyse");
  row("Energy Brain-score", `${report.energy_brain.score} / 100`);
  row("Energie-indicatie", report.recommendation);
  row("Methode", "Indicatief labelmodel");

  section("4. Aanbevolen maatregel");
  row("Maatregel", report.energy_brain.recommended_measure);
  row("Indicatieve investering", money(report.energy_brain.estimated_investment_eur));

  section("5. Geschatte jaarlijkse besparing");
  row("Energiebesparing per jaar", money(report.energy_brain.estimated_annual_saving_eur));

  section("6. Indicatieve terugverdientijd");
  row("Geschat", `${decimal.format(report.energy_brain.payback_years)} jaar`);

  section("7. Eindconclusie");
  paragraph(report.recommendation, 11, "#17344D");
  document.moveDown(0.45);
  paragraph(report.disclaimer, 9, muted, 3);

  document.end();
  return result;
}
