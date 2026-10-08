export type EnergyxReportData = {
  syncedAt: string;
  building: {
    type: string;
    areaM2: number;
    buildYear: number;
    energyLabel: string;
  };
  specs: {
    wwsPoints: number | null;
    wwsPointsGain: number | null;
    heatingKw: number;
    coolingKw: number;
  };
  metrics: {
    solar: { panels: number; kwp: number };
    battery: { kwh: number };
    annualSavings: number;
    paybackYears: number | null;
    investments: { total: number };
  };
};

const escapeHtml = (value: string | number): string =>
  String(value).replace(/[&<>"']/gu, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);

const euro = (value: number) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);

const valueOrDash = (value: number | null, suffix = "") =>
  value === null ? "Nog niet ingevuld" : `${value}${suffix}`;

export function buildEnergyxReportHtml(
  address: string,
  data: EnergyxReportData,
): string {
  const rows: Array<[string, string]> = [
    ["Adres", address],
    ["Objecttype", data.building.type],
    ["Oppervlakte", `${data.building.areaM2} m²`],
    ["Bouwjaar", String(data.building.buildYear)],
    ["Huidig energielabel", data.building.energyLabel],
    ["Verwarmingsbehoefte", `${data.specs.heatingKw} kW`],
    ["Koelbehoefte", `${data.specs.coolingKw} kW`],
    ["Aanbevolen zonnepanelen", `${data.metrics.solar.panels} panelen · ${data.metrics.solar.kwp} kWp`],
    ["Aanbevolen batterij", `${data.metrics.battery.kwh} kWh`],
    ["Investeringsindicatie", euro(data.metrics.investments.total)],
    ["Geschatte jaarlijkse energiebesparing", euro(data.metrics.annualSavings)],
    ["Terugverdientijd", valueOrDash(data.metrics.paybackYears, " jaar")],
    ["Huidige WWS-punten", valueOrDash(data.specs.wwsPoints)],
    ["Indicatieve WWS-puntenwinst", valueOrDash(data.specs.wwsPointsGain, " punten")],
  ];
  const tableRows = rows
    .map(([label, value]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const createdAt = escapeHtml(new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date()));
  const safeAddress = escapeHtml(address);

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verduurzamingsrapport — ${safeAddress}</title>
<style>
  :root{font-family:Inter,Arial,sans-serif;color:#182336;background:#f5f4f0}
  *{box-sizing:border-box}
  body{margin:0;padding:32px}
  main{max-width:820px;margin:0 auto;padding:44px;background:#fff;border:1px solid #e4e1da;border-radius:18px}
  header{padding-bottom:24px;border-bottom:2px solid #d9e9e4}
  .eyebrow{color:#b47720;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
  h1{margin:10px 0 6px;font-size:30px;letter-spacing:-.04em}
  .address{color:#5e6877;font-size:15px}
  .notice{margin:22px 0;padding:13px 15px;border-radius:10px;background:#fbf2df;color:#755317;font-size:12px;line-height:1.6}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  th,td{padding:13px 10px;border-bottom:1px solid #eae8e2;text-align:left;font-size:13px;line-height:1.45}
  th{width:55%;font-weight:600;color:#596373}
  td{font-weight:700}
  footer{margin-top:24px;color:#7d8490;font-size:11px;line-height:1.6}
  .actions{display:flex;justify-content:flex-end;gap:10px;margin:0 auto 14px;max-width:820px}
  button{border:0;border-radius:9px;padding:11px 16px;background:#1d745f;color:white;font-weight:700;cursor:pointer}
  .secondary{background:#e9e7e0;color:#283447}
  @media print{ :root{background:#fff} body{padding:0} main{max-width:none;padding:18mm;border:0;border-radius:0} .actions{display:none} tr{break-inside:avoid} }
  @media(max-width:600px){body{padding:12px}main{padding:24px 18px}h1{font-size:24px}th,td{padding:10px 6px;font-size:12px}}
</style>
</head>
<body>
<div class="actions"><button class="secondary" onclick="window.close()">Sluiten</button><button onclick="window.print()">Afdrukken / opslaan als PDF</button></div>
<main>
  <header><div class="eyebrow">RealEstateX · B2B</div><h1>Verduurzamingsrapport</h1><div class="address">${safeAddress}</div></header>
  <div class="notice">Indicatieve berekening op basis van de beschikbare objectgegevens. Geen live EnergyX-rapport of officiële WWS-puntentelling. De WWS-puntenwinst hieronder is alleen een handmatige indicatie indien ingevuld.</div>
  <table><tbody>${tableRows}</tbody></table>
  <footer>Rapport aangemaakt op ${createdAt}. Bronstatus: RealEstateX-berekening; laatste synchronisatie ${escapeHtml(new Date(data.syncedAt).toLocaleString("nl-NL"))}.</footer>
</main>
</body>
</html>`;
}

export function exportEnergyxReport(
  address: string,
  data: EnergyxReportData,
): "opened" | "downloaded" {
  const html = buildEnergyxReportHtml(address, data);
  const reportWindow = window.open("", "_blank");
  if (reportWindow) {
    reportWindow.opener = null;
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    return "opened";
  }

  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `verduurzamingsrapport-${address.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "object"}.html`;
  link.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
