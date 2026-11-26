import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileText,
  Leaf,
  Lightbulb,
  MapPin,
  RefreshCw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import {
  getGetMarketTrendsQueryKey,
  getGetPropertyReportQueryKey,
  getListDealsQueryKey,
  getListPropertiesQueryKey,
  useGetMarketTrends,
  useGetPropertyReport,
  useListDeals,
  useListProperties,
} from "@workspace/api-client-react";
import type { DealRecord, Property } from "@workspace/api-client-react";
import { EnergyXModule } from "@/components/energyx-module";
import { AppShell } from "@/components/app-shell";
import { EmptyBlock, ErrorBlock, LoadingBlock, formatEuro, formatNumber } from "@/components/ui-elements";

type CategoryId =
  | "rendementskans"
  | "splitsingskans"
  | "transformatiekans"
  | "verduurzamingskans"
  | "waardestijgingskans"
  | "investeringskans";

const categories: { id: CategoryId; label: string; descriptor: string; field: string; icon: typeof BarChart3 }[] = [
  { id: "rendementskans", label: "Rendement", descriptor: "Bruto rendement", field: "grossYield", icon: BarChart3 },
  { id: "splitsingskans", label: "Splitsing", descriptor: "Bestaande splitindicator", field: "splitScore", icon: Building2 },
  { id: "transformatiekans", label: "Transformatie", descriptor: "Bestaande transformatie-indicator", field: "transformationScore", icon: RefreshCw },
  { id: "verduurzamingskans", label: "Verduurzaming", descriptor: "Bestaande energie-indicator", field: "energyScore", icon: Leaf },
  { id: "waardestijgingskans", label: "Waardeontwikkeling", descriptor: "Bestaande waardemarge", field: "margin", icon: ArrowUpRight },
  { id: "investeringskans", label: "Investering", descriptor: "Bestaande Flits-indicator", field: "flitsScore", icon: Lightbulb },
];

const cardClass = "rounded-2xl border border-border bg-card shadow-xs";
const numberFormat = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
const valueLabel = (value: number | null | undefined, suffix = "") =>
  value == null || !Number.isFinite(value) ? "—" : `${numberFormat.format(value)}${suffix}`;

function ReportDetail({ property, onClose }: { property: Property; onClose: () => void }) {
  const report = useGetPropertyReport(property.propertyId, {
    query: {
      enabled: Boolean(property.propertyId),
      queryKey: getGetPropertyReportQueryKey(property.propertyId),
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#172a38]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="report-title" data-testid="dialog-opportunity-report">
      <section className="my-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div><p className="mono text-[10px] uppercase tracking-[0.18em] text-[#a66a29]">Bestaand objectrapport</p><h2 id="report-title" className="display mt-1 text-2xl font-bold tracking-[-0.05em]">{property.adres}</h2><p className="mt-1 text-xs text-muted-foreground">Rapportdata wordt pas opgehaald wanneer je dit detail opent.</p></div>
          <button onClick={onClose} aria-label="Rapport sluiten" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" data-testid="button-close-opportunity-report"><X size={18} /></button>
        </div>
        {report.isLoading ? <div className="py-6"><LoadingBlock lines={5} /></div> : report.isError ? <div className="py-6"><ErrorBlock message="Het objectrapport kon niet worden geladen." onRetry={() => report.refetch()} /></div> : report.data ? <div className="space-y-4 py-5" data-testid="report-opportunity-content">
          <div className="grid gap-3 sm:grid-cols-3">
            <ReportStat label="Bruto rendement" value={valueLabel(report.data.profitability.gross_yield_percent, "%")} detail={report.data.profitability.classification.replaceAll("_", " ")} />
            <ReportStat label="Energy Brain" value={`${report.data.energy_brain.score}/100`} detail={report.data.energy_brain.recommended_measure} />
            <ReportStat label="Advies in rapport" value={report.data.recommendation.replaceAll("_", " ")} detail="Bestaande rapportindicatie" />
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-bold">Rapportcontext</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{report.data.profitability.note}</p>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{report.data.disclaimer}</p>
            <p className="mt-3 text-[10px] text-muted-foreground">Bijgewerkt {new Date(report.data.generated_at).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
          <p className="rounded-xl bg-[#f8f1e5] px-4 py-3 text-[11px] leading-5 text-[#745b35]">Deze bestaande rapportuitkomsten zijn indicatief en vormen geen onafhankelijke goedkeuring, taxatie of investeringsbesluit.</p>
        </div> : <div className="py-6"><EmptyBlock title="Rapport niet beschikbaar" description="Voor dit object is op dit moment geen rapportdetail teruggekomen." /></div>}
      </section>
    </div>
  );
}

function ReportStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-border bg-background p-3.5"><p className="text-[10px] uppercase tracking-[0.11em] text-muted-foreground">{label}</p><p className="display mt-2 text-xl font-bold leading-tight">{value}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p></div>;
}

function ScoreChip({ label, value, active, displayValue }: { label: string; value: number | null | undefined; active: boolean; displayValue?: string }) {
  return <div className={`rounded-lg px-2.5 py-2 ${active ? "bg-[#e7f1ec] text-[#286a58] ring-1 ring-[#b9d5c9]" : "bg-background text-muted-foreground"}`}><p className="text-[9px] uppercase tracking-[0.08em]">{label}</p><p className="mono mt-1 text-sm font-medium">{displayValue ?? valueLabel(value, value == null ? "" : "/100")}</p></div>;
}

function DealCard({ deal, category, property }: { deal: DealRecord; category: CategoryId; property?: Property }) {
  const activeCategory = categories.find((item) => item.id === category)!;
  const scoreValue = activeCategory.field === "grossYield"
    ? deal.score.grossYield
    : activeCategory.field === "margin"
      ? deal.score.margin
      : deal.score[activeCategory.field as "flitsScore" | "splitScore" | "transformationScore" | "energyScore" | "totalScore"];
  const scoreDisplay = activeCategory.field === "margin"
    ? formatEuro(scoreValue)
    : valueLabel(scoreValue, activeCategory.field === "grossYield" ? "%" : scoreValue == null ? "" : "/100");
  return <article className={`${cardClass} overflow-hidden`} data-testid={`card-opportunity-deal-${deal.dealId}`}>
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mono text-[9px] uppercase tracking-[0.17em] text-[#a66a29]">{deal.region}{deal.municipality ? ` · ${deal.municipality}` : ""}</p>
          <h3 className="display mt-1 truncate text-xl font-bold tracking-[-0.04em]">{deal.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><MapPin size={12} />{property?.adres ?? "Object uit eigen portefeuille"}{property ? ` · ${property.type} · ${formatNumber(property.woonoppervlak)} m²` : ""}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold tracking-[0.09em] ${deal.score.decision === "GO" ? "bg-[#e1f1e9] text-[#286a58]" : deal.score.decision === "HOLD" ? "bg-[#f7eddc] text-[#8a652d]" : "bg-[#f4e7e3] text-[#99564c]"}`}>Bestaand besluit · {deal.score.decision}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(220px,.9fr)]">
        <div className="rounded-xl bg-[#f2f4ef] p-4">
          <p className="text-[9px] uppercase tracking-[0.13em] text-muted-foreground">Uitgelicht · {activeCategory.descriptor}</p>
          <p className="display mt-1 text-4xl font-bold tracking-[-0.06em] text-[#315c4c]">{scoreDisplay}</p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Alleen nadruk op een bestaand veld. Geen nieuwe score, rangschikking of filter.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border p-3"><p className="text-[9px] text-muted-foreground">Vraagprijs</p><p className="mono mt-1 text-sm font-medium">{formatEuro(deal.askingPrice)}</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-[9px] text-muted-foreground">Verwachte waarde</p><p className="mono mt-1 text-sm font-medium">{formatEuro(deal.expectedValue)}</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-[9px] text-muted-foreground">Bruto rendement</p><p className="mono mt-1 text-sm font-medium">{valueLabel(deal.score.grossYield, "%")}</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-[9px] text-muted-foreground">Marge</p><p className="mono mt-1 text-sm font-medium">{formatEuro(deal.score.margin)}</p></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <ScoreChip label="Flits" value={deal.score.flitsScore} active={category === "investeringskans"} />
        <ScoreChip label="Splitsing" value={deal.score.splitScore} active={category === "splitsingskans"} />
        <ScoreChip label="Transformatie" value={deal.score.transformationScore} active={category === "transformatiekans"} />
        <ScoreChip label="Energie" value={deal.score.energyScore} active={category === "verduurzamingskans"} />
        <ScoreChip label="Waardemarge" value={deal.score.margin} active={category === "waardestijgingskans"} displayValue={formatEuro(deal.score.margin)} />
        <ScoreChip label="Totaal" value={deal.score.totalScore} active={false} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="flex items-center gap-1.5 text-[10px] leading-4 text-muted-foreground"><CircleHelp size={13} /> Bestaande dealindicatoren, geen onafhankelijke goedkeuring.</p>
        <Link href={`/dealing-room?deal=${encodeURIComponent(deal.dealId)}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid={`link-opportunity-dealing-room-${deal.dealId}`}>Open in Dealing Room <ArrowRight size={14} /></Link>
      </div>
      {deal.score.assessment && <details className="rounded-xl border border-border bg-background px-3.5 py-2.5">
        <summary className="cursor-pointer text-[11px] font-bold">Bestaande assessmentvelden bekijken</summary>
        <div className="mt-3 grid gap-2 text-[10px] leading-5 text-muted-foreground sm:grid-cols-2">
          <p>Assessmentversie: <strong className="text-foreground">{deal.score.assessment.version}</strong></p>
          <p>Eligibility in bestaande assessment: <strong className="text-foreground">{deal.score.assessment.eligible ? "Ja" : "Nee"}</strong></p>
          <p>Bruto rendement assessment: <strong className="text-foreground">{valueLabel(deal.score.assessment.grossYieldPercent, "%")}</strong></p>
          <p>Verificatie: <strong className="text-foreground">{deal.score.assessment.regionVerification}</strong></p>
          {deal.score.assessment.reasons.length > 0 && <p className="sm:col-span-2">Redenen: {deal.score.assessment.reasons.join(" · ")}</p>}
        </div>
      </details>}
    </div>
  </article>;
}

function OpportunityEngine() {
  const propertiesQuery = useListProperties({ query: { queryKey: getListPropertiesQueryKey(), staleTime: 60000 } });
  const dealsQuery = useListDeals({ query: { queryKey: getListDealsQueryKey(), staleTime: 60000 } });
  const marketQuery = useGetMarketTrends({ query: { queryKey: getGetMarketTrendsQueryKey(), staleTime: 60000 } });
  const properties = propertiesQuery.data ?? [];
  const deals = dealsQuery.data ?? [];
  const [category, setCategory] = useState<CategoryId>("rendementskans");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [reportPropertyId, setReportPropertyId] = useState<string | null>(null);
  const [energyPropertyId, setEnergyPropertyId] = useState<string | null>(null);
  const visiblePropertyIds = useMemo(() => new Set(properties.map((property) => property.propertyId)), [properties]);
  const visibleDeals = useMemo(() => deals.filter((deal) => visiblePropertyIds.has(deal.propertyId)), [deals, visiblePropertyIds]);
  const selectedProperty = properties.find((property) => property.propertyId === selectedPropertyId);
  const shownDeals = selectedPropertyId ? visibleDeals.filter((deal) => deal.propertyId === selectedPropertyId) : visibleDeals;
  const reportProperty = reportPropertyId ? properties.find((property) => property.propertyId === reportPropertyId) : undefined;
  const energyProperty = energyPropertyId ? properties.find((property) => property.propertyId === energyPropertyId) : undefined;
  const activeCategory = categories.find((item) => item.id === category)!;
  const propertiesLoading = propertiesQuery.isLoading;
  const propertiesError = propertiesQuery.isError;
  const dealsLoading = dealsQuery.isLoading;
  const dealsError = dealsQuery.isError;

  return <AppShell><div className="animate-rise space-y-7">
    <header className="relative overflow-hidden rounded-[1.5rem] border border-[#d6e0d8] bg-[#edf2eb] px-5 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[34px] border-[#739b83]/10" />
      <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
        <div><p className="mono text-[10px] uppercase tracking-[0.2em] text-[#567766]">Eigen portefeuille · signalen in samenhang</p><h2 className="display mt-3 max-w-3xl text-4xl font-bold leading-[1.03] tracking-[-0.065em] sm:text-5xl">Kansen in beeld.<br /><span className="text-[#537863]">Beslissingen blijven van jou.</span></h2><p className="mt-4 max-w-2xl text-sm leading-6 text-[#576b60]">Bekijk je bestaande object- en dealinformatie per invalshoek. RealEstateX brengt signalen bij elkaar; het geeft geen onafhankelijke goedkeuring.</p></div>
        <div className="rounded-xl border border-[#d3ded5] bg-[#f7f8f3]/80 p-4">
          <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#dce8dd] text-[#456f57]"><CheckCircle2 size={16} /></span><p className="text-xs font-bold">Bronnen in deze weergave</p></div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Je zichtbare objecten, gekoppelde bestaande deals en rapportdetails die je zelf opent.</p>
          <p className="mono mt-3 text-[9px] uppercase tracking-[0.1em] text-[#567766]">Geen nieuwe berekening · geen automatische keuze</p>
        </div>
      </div>
    </header>

    <section aria-labelledby="category-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="mono text-[9px] uppercase tracking-[0.17em] text-[#a66a29]">Kies een lens</p><h3 id="category-title" className="display mt-1 text-xl font-bold tracking-[-0.04em]">Zes manieren om te kijken</h3></div><p className="text-[10px] text-muted-foreground">De selectie wijzigt alleen de nadruk, niet de deals.</p></div>
       <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Opportunity categorie">
        {categories.map((item) => {
          const Icon = item.icon;
          const active = category === item.id;
           return <button key={item.id} type="button" aria-pressed={active} onClick={() => setCategory(item.id)} className={`min-h-[88px] rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#68876d] ${active ? "border-[#8eaa92] bg-[#e7efe7] text-[#315c45] shadow-sm" : "border-border bg-card text-muted-foreground hover:border-[#b6c8b8] hover:bg-[#f5f7f1]"}`} data-testid={`tab-opportunity-${item.id}`}><span className="flex items-center justify-between"><Icon size={17} /><span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#5f8668]" : "bg-transparent"}`} /></span><span className="mt-3 block text-[11px] font-bold leading-4">{item.label}</span></button>;
        })}
      </div>
    </section>

    <section className={`${cardClass} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5`} aria-labelledby="market-context-title" data-testid="panel-opportunity-market">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e9eee6] text-[#607765]"><BarChart3 size={17} /></span><div><p className="mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Bestaande marktinformatie</p><h3 id="market-context-title" className="mt-1 text-sm font-bold">Marktcontext voor je beoordeling</h3>{marketQuery.isLoading ? <p className="mt-1 text-[11px] text-muted-foreground">Marktbeeld laden…</p> : marketQuery.isError ? <p className="mt-1 text-[11px] text-muted-foreground" role="status">Marktbeeld tijdelijk niet beschikbaar.</p> : marketQuery.data ? <p className="mt-1 text-[11px] text-muted-foreground" data-testid="text-opportunity-market">{marketQuery.data.trend} · {marketQuery.data.change > 0 ? "+" : ""}{valueLabel(marketQuery.data.change, "%")} · {marketQuery.data.period}</p> : <p className="mt-1 text-[11px] text-muted-foreground">Geen marktbeeld beschikbaar.</p>}</div></div>
      <Link href="/market" className="inline-flex min-h-10 items-center gap-2 self-start rounded-lg border border-border bg-background px-3 text-xs font-bold hover:bg-secondary sm:self-auto" data-testid="link-opportunity-market">Open Marktbeeld <ArrowRight size={14} /></Link>
    </section>

    <section className={`${cardClass} p-4 sm:p-5`} aria-labelledby="property-context-title">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf0e8] text-[#58745f]"><Building2 size={18} /></span><div><p className="mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Portefeuillecontext</p><h3 id="property-context-title" className="display mt-1 text-lg font-bold">{selectedProperty ? selectedProperty.adres : "Alle zichtbare objecten"}</h3><p className="mt-1 text-[11px] text-muted-foreground">{propertiesLoading ? "Objecten laden…" : `${properties.length} object${properties.length === 1 ? "" : "en"} in je zichtbare lijst`}</p></div></div>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold md:min-w-[280px]"><span className="sr-only">Selecteer een object</span><select aria-label="Selecteer objectcontext" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} className="min-w-0 flex-1 appearance-none bg-transparent py-2 outline-none" data-testid="select-opportunity-property"><option value="">Alle zichtbare objecten</option>{properties.map((property) => <option key={property.propertyId} value={property.propertyId}>{property.adres}</option>)}</select><ChevronDown size={15} className="text-muted-foreground" /></label>
      </div>
      {propertiesLoading ? <div className="mt-4"><LoadingBlock lines={2} /></div> : propertiesError ? <div className="mt-4"><ErrorBlock message="Je objectlijst kon niet worden geladen." onRetry={() => propertiesQuery.refetch()} /></div> : properties.length > 0 && <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-3">
        {(selectedProperty ? [selectedProperty] : properties).map((property) => <article key={property.propertyId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-3" data-testid={`card-opportunity-property-${property.propertyId}`}>
           <div className="min-w-0"><p className="truncate text-xs font-bold">{property.adres}</p><p className="mt-1 text-[10px] text-muted-foreground">{[property.postcode, property.plaats].filter(Boolean).join(" ") || "Locatie nog niet ingevuld"} · {property.type} · {property.bouwjaar} · {formatNumber(property.woonoppervlak)} m² · label {property.energielabel}</p></div>
          <div className="flex shrink-0 gap-1">
            <button onClick={() => setReportPropertyId(property.propertyId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[10px] font-bold hover:bg-secondary" aria-label={`Open bestaand rapport voor ${property.adres}`} data-testid={`button-opportunity-report-${property.propertyId}`}><FileText size={13} /> Rapport</button>
            <button onClick={() => setEnergyPropertyId(property.propertyId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[10px] font-bold hover:bg-secondary" aria-label={`Open EnergyX voor ${property.adres}`} data-testid={`button-opportunity-energyx-${property.propertyId}`}><Zap size={13} /> EnergyX</button>
          </div>
        </article>)}
      </div>}
    </section>

    <section aria-labelledby="signals-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="mono text-[9px] uppercase tracking-[0.17em] text-[#a66a29]">{activeCategory.id}</p><h3 id="signals-title" className="display mt-1 text-2xl font-bold tracking-[-0.05em]">Bestaande deals, zonder rangorde</h3><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">Alleen deals waarvan het propertyId voorkomt in je zichtbare objectlijst worden getoond.</p></div><span className="rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">{shownDeals.length} gekoppeld{shownDeals.length === 1 ? "e deal" : "e deals"}</span></div>
      {dealsLoading ? <div className="space-y-3"><LoadingBlock lines={3} /><LoadingBlock lines={3} /></div> : dealsError ? <ErrorBlock message="De dealinformatie kon niet worden geladen." onRetry={() => dealsQuery.refetch()} /> : propertiesError ? <div className={`${cardClass} p-5 text-xs leading-5 text-muted-foreground`}>Deals blijven verborgen totdat de zichtbare objectlijst beschikbaar is.</div> : properties.length === 0 ? <EmptyBlock title="Nog geen objecten in beeld" description="Voeg eerst een eigen object toe. Alleen deals die aan een zichtbaar object zijn gekoppeld, worden hier getoond." /> : shownDeals.length === 0 ? <EmptyBlock title="Geen gekoppelde deals in deze weergave" description={selectedProperty ? "Er is geen deal gekoppeld aan dit object. Kies een andere zichtbare eigendom of bekijk de Dealing Room." : "Er zijn nog geen tenant-deals gekoppeld aan je zichtbare objecten."} action={<Link href="/dealing-room" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground" data-testid="link-opportunity-dealing-room-empty">Naar Dealing Room <ArrowRight size={14} /></Link>} /> : <div className="space-y-3">{shownDeals.map((deal) => <DealCard key={deal.dealId} deal={deal} category={category} property={properties.find((property) => property.propertyId === deal.propertyId)} />)}</div>}
    </section>

    <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-2xl border border-[#d8e3dc] bg-[#f2f6f1] p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#dfeade] text-[#54765b]"><Sparkles size={16} /></span><div><p className="mono text-[9px] uppercase tracking-[0.17em] text-[#58745f]">Toekomstige voorbereiding</p><h3 className="display mt-1 text-xl font-bold tracking-[-0.04em]">AI-analyse is nog niet actief</h3></div></div>
        <p className="mt-3 max-w-xl text-xs leading-5 text-[#5e6c60]">Aanbevelingen, uitleg en AI-analyse zijn toekomstig voorbereid. Deze pagina doet geen AI-aanroep en maakt geen automatische selectie.</p>
        <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-lg border border-[#d6e1d6] bg-white/65 px-2.5 py-1.5 text-[10px] text-muted-foreground">Geen gegenereerde aanbeveling</span><span className="rounded-lg border border-[#d6e1d6] bg-white/65 px-2.5 py-1.5 text-[10px] text-muted-foreground">Geen ranking</span><span className="rounded-lg border border-[#d6e1d6] bg-white/65 px-2.5 py-1.5 text-[10px] text-muted-foreground">Jij beoordeelt de brondata</span></div>
      </div>
      <div className="rounded-2xl border border-[#e4d8c2] bg-[#f7f1e6] p-5 sm:p-6" data-testid="panel-catch-of-the-day-preparation">
        <div className="flex items-start justify-between gap-3"><div><p className="mono text-[9px] uppercase tracking-[0.17em] text-[#997445]">Voorbereidingsplek</p><h3 className="display mt-1 text-xl font-bold tracking-[-0.04em]">Catch of the Day</h3></div><span className="rounded-full border border-[#e2d4bb] bg-white/55 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.09em] text-[#8b704b]">Niet actief</span></div>
        <p className="mt-3 text-xs leading-5 text-[#76674f]">Een toekomstige plek voor een door jou gekozen case. Er wordt vandaag niets automatisch geselecteerd of uitgelicht.</p>
        <div className="mt-4 flex items-center gap-2 border-t border-[#e7dbc5] pt-3 text-[10px] text-[#8b704b]"><CircleHelp size={13} /> Geen selectie of aanbeveling beschikbaar</div>
      </div>
    </section>

    <section className={`${cardClass} p-5 sm:p-6`} aria-labelledby="workspace-links-title">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="mono text-[9px] uppercase tracking-[0.17em] text-muted-foreground">Verder met je eigen beoordeling</p><h3 id="workspace-links-title" className="display mt-1 text-xl font-bold tracking-[-0.04em]">Verbonden werkruimtes</h3></div><p className="text-[10px] text-muted-foreground">Open de bestaande module die past bij je volgende stap.</p></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <WorkspaceLink href="/dealing-room" title="Dealing Room" detail="Bekijk en bespreek deals" icon={Building2} />
        <WorkspaceLink href="/calculators" title="Rekentools" detail="Reken je eigen scenario door" icon={BarChart3} />
        <WorkspaceLink href="/market" title="Marktbeeld" detail="Bekijk bestaande markttrends" icon={BarChart3} />
        <WorkspaceLink href="/property-transformer" title="Property Transformer" detail="Verken een transformatie" icon={RefreshCw} />
        <WorkspaceLink href="/suite" title="Suite & assistent" detail="Open verbonden modules" icon={Sparkles} />
        <WorkspaceLink href="/control-room" title="Control Room" detail="Platformstatus en signalen" icon={CircleHelp} />
      </div>
    </section>

    <footer className="flex items-start gap-2 border-t border-border pt-4 text-[10px] leading-5 text-muted-foreground"><CircleHelp size={14} className="mt-0.5 shrink-0" /><p>Opportunity Engine ordent bestaande informatie voor jouw review. Scores, assessments, rapporten en EnergyX-uitkomsten zijn bestaande signalen; ze zijn geen onafhankelijke goedkeuring, professioneel advies of vervanging van eigen due diligence.</p></footer>
  </div>
  {reportProperty && <ReportDetail key={reportProperty.propertyId} property={reportProperty} onClose={() => setReportPropertyId(null)} />}
  {energyProperty && <EnergyXModule propertyId={energyProperty.propertyId} adres={energyProperty.adres} onClose={() => setEnergyPropertyId(null)} />}
  </AppShell>;
}

function WorkspaceLink({ href, title, detail, icon: Icon }: { href: string; title: string; detail: string; icon: typeof BarChart3 }) {
  return <Link href={href} className="group flex min-h-[74px] items-center gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:border-[#b8c8b8] hover:bg-[#f2f5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#68876d]" data-testid={`link-opportunity-${title.toLowerCase().replaceAll(" ", "-")}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e9eee6] text-[#607765]"><Icon size={16} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold">{title}</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{detail}</span></span><ExternalLink size={13} className="shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>;
}

export default OpportunityEngine;
export { OpportunityEngine };
