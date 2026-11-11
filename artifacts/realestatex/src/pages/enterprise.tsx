import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CoInvestmentIndicator } from "@/components/co-investment-indicator";
import {
  ArrowDownToLine,
  Building2,
  Check,
  CircleDollarSign,
  ChevronLeft,
  ChevronRight,
  Contact,
  Download,
  ExternalLink,
  Gauge,
  Handshake,
  ImageOff,
  Leaf,
  Newspaper,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  createCrmContact,
  createInvestor,
  downloadInvestorReadySheet,
  getGetDealEnergyAnalysisQueryKey,
  getGetDealMediaBriefQueryKey,
  getGetDealMatchesQueryKey,
  getGetDealNeighborhoodSentimentQueryKey,
  getGetDealQueryKey,
  getGetDealSalesIntelligenceQueryKey,
  getGetEnterpriseOverviewQueryKey,
  getGetInvestorRecommendationsQueryKey,
  getGetVisitorIntentSummaryQueryKey,
  getGetSaasBillingStatusQueryKey,
  getGetSaasEntitlementsQueryKey,
  getListCrmActivitiesQueryKey,
  getListCrmContactsQueryKey,
  getListDealsQueryKey,
  getListInvestorsQueryKey,
  getListPropertiesQueryKey,
  useGetDealMediaBrief,
  useGetDealNeighborhoodSentiment,
  useGetDealSalesIntelligence,
  useGetInvestorRecommendations,
  useGetVisitorIntentSummary,
  useRecordVisitorIntentEvent,
  useRefreshDealNeighborhoodSentiment,
  useCreateCrmContact,
  useCreateCrmActivity,
  useCreateDeal,
  useCreateInvestor,
  useGetDeal,
  useGetDealMatches,
  useGetEnterpriseOverview,
  useGetSaasBillingStatus,
  useGetSaasEntitlements,
  useListCrmActivities,
  useListCrmContacts,
  useListDeals,
  useListInvestors,
  useListProperties,
} from "@workspace/api-client-react";
import type {
  CrmContactInput,
  CrmActivityInput,
  DealInput,
  InvestorInput,
} from "@workspace/api-client-react";
import { AppShell } from "@/components/app-shell";
import { InvestmentFields, InvestmentResult } from "@/components/investment-fields";
import { DealAssumptionsEditor } from "@/components/deal-assumptions-editor";
import type { InvestmentAssumptions } from "@workspace/api-client-react";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SectionHeading,
  SubmitButton,
  formatEuro,
  formatNumber,
} from "@/components/ui-elements";

const cardClass = "rounded-2xl border border-border bg-card p-5 shadow-xs";

function scoreColor(score: number) {
  return score >= 70
    ? "bg-[#e3f3ee] text-[#207464]"
    : score >= 50
      ? "bg-[#faeedc] text-[#a4671c]"
      : "bg-[#fae7e3] text-[#a4443b]";
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Building2;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
          <p className="display mt-3 text-3xl font-bold tracking-[-0.06em]">{value}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">{detail}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e4e9f2] text-[#435a7b]">
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function DealForm({ onCreated }: { onCreated: (dealId: string) => void }) {
  const [assumptions, setAssumptions] = useState<InvestmentAssumptions>();
  const properties = useListProperties();
  const create = useCreateDeal();
  const client = useQueryClient();
  const [form, setForm] = useState({
    propertyId: "",
    title: "",
    region: "",
    askingPrice: "",
    renovationCost: "0",
    expectedValue: "",
    monthlyRent: "0",
    municipality: "",
  });
  const selectedProperty = properties.data?.find((item) => item.propertyId === form.propertyId);
  const update = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload: DealInput = {
      investmentAssumptions: assumptions,
      propertyId: form.propertyId,
      title: form.title || selectedProperty?.adres || "Nieuwe deal",
      region: form.region || selectedProperty?.adres || "Nederland",
      askingPrice: Number(form.askingPrice),
      renovationCost: Number(form.renovationCost),
      expectedValue: Number(form.expectedValue),
      monthlyRent: Number(form.monthlyRent),
      ...(form.municipality ? { municipality: form.municipality } : {}),
    };
    create.mutate(
      { data: payload },
      {
        onSuccess: (deal) => {
          setAssumptions(undefined);
          client.invalidateQueries({ queryKey: getListDealsQueryKey() });
          client.invalidateQueries({ queryKey: getGetEnterpriseOverviewQueryKey() });
          onCreated(deal.dealId);
          setForm({
            propertyId: "",
            title: "",
            region: "",
            askingPrice: "",
            renovationCost: "0",
            expectedValue: "",
            monthlyRent: "0",
            municipality: "",
          });
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className={cardClass}>
      <div className="mb-5">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#c17b21]">Nieuwe case</p>
        <h3 className="display mt-2 text-2xl font-bold tracking-[-0.05em]">Deal toevoegen</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Start met een bestaand object; de server berekent daarna energie, subsidies, ROI en score.
        </p>
      </div>
      <div className="space-y-3">
        <label className="block text-xs font-semibold">
          Object
          <select
            required
            value={form.propertyId}
            onChange={(event) => update("propertyId")(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
          >
            <option value="">Kies een object</option>
            {(properties.data ?? []).map((property) => (
              <option key={property.propertyId} value={property.propertyId}>
                {property.adres}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">
            Titel
            <input value={form.title} onChange={(event) => update("title")(event.target.value)} placeholder="Transformatiecase centrum" className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          </label>
          <label className="text-xs font-semibold">
            Regio
            <input required value={form.region} onChange={(event) => update("region")(event.target.value)} placeholder="Amsterdam" className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">
            Vraagprijs
            <input required type="number" min="1" value={form.askingPrice} onChange={(event) => update("askingPrice")(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          </label>
          <label className="text-xs font-semibold">
            Verwachte waarde
            <input required type="number" min="1" value={form.expectedValue} onChange={(event) => update("expectedValue")(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold">
            Renovatie
            <input type="number" min="0" value={form.renovationCost} onChange={(event) => update("renovationCost")(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          </label>
          <label className="text-xs font-semibold">
            Huur p/m
            <input type="number" min="0" value={form.monthlyRent} onChange={(event) => update("monthlyRent")(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          </label>
          <label className="text-xs font-semibold">
            Gemeente
            <input value={form.municipality} onChange={(event) => update("municipality")(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          </label>
        </div>
      </div>
      <InvestmentFields value={assumptions} onChange={setAssumptions} />
      {create.isError && <p className="mt-4 text-xs font-semibold text-[#a4443b]">Deal kon niet worden opgeslagen. Controleer objecttoegang en bedragen.</p>}
      <div className="mt-5">
        <SubmitButton pending={create.isPending}>Deal opslaan</SubmitButton>
      </div>
    </form>
  );
}

function DealDetail({ dealId }: { dealId: string }) {
  const detail = useGetDeal(dealId, {
    query: { queryKey: getGetDealQueryKey(dealId), enabled: Boolean(dealId) },
  });
  const matches = useGetDealMatches(dealId, {
    query: { queryKey: getGetDealMatchesQueryKey(dealId), enabled: Boolean(dealId) },
  });
  if (!dealId) {
    return <EmptyBlock title="Kies een deal" description="De detailweergave toont score, verduurzaming, subsidies en matches." />;
  }
  if (detail.isLoading) return <LoadingBlock lines={8} />;
  if (detail.isError || !detail.data) return <ErrorBlock onRetry={() => detail.refetch()} />;
  const data = detail.data;
  const download = async () => {
    const blob = await downloadInvestorReadySheet(dealId);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.deal.dealId}-investor-ready-sheet.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#c17b21]">Deal detail</p>
          <h3 className="display mt-2 text-3xl font-bold tracking-[-0.06em]">{data.deal.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{data.deal.region} · {data.deal.propertyType} · {data.deal.energyLabel}</p>
        </div>
        <button onClick={download} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground">
          <Download size={15} /> Investor Ready Sheet
        </button>
      </div>
      {data.deal.score.transformationScore >= 70 && (
        <CoInvestmentIndicator
          dealId={dealId}
          matches={matches.data ?? []}
          matchesLoading={matches.isLoading}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Flits", data.deal.score.flitsScore],
          ["Split", data.deal.score.splitScore],
          ["Transformatie", data.deal.score.transformationScore],
          ["Energie", data.deal.score.energyScore],
          ["Subsidies", data.deal.score.subsidyScore],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-background p-4">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={`mono mt-2 inline-flex rounded-lg px-2 py-1 text-xl font-medium ${scoreColor(Number(value))}`}>{value}</p>
          </div>
        ))}
      </div>
      {data.deal.score.gutFeelingScore != null && <div className="rounded-2xl border border-[#d7e6e0] bg-[#f5faf7] p-4" data-testid="panel-gut-feeling"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="mono text-[10px] uppercase tracking-[0.16em] text-[#287b6a]">Gut Feeling</p><p className="mt-1 text-sm font-bold">{data.deal.gutFeeling?.summary ?? "Buurt- en contextsignaal toegevoegd aan de score."}</p></div><div className="flex gap-5 text-right"><div><p className="text-[10px] text-muted-foreground">Score</p><p className="mono text-xl text-[#287b6a]">{data.deal.score.gutFeelingScore}/100</p></div><div><p className="text-[10px] text-muted-foreground">Zekerheid</p><p className="mono text-xl">{data.deal.score.gutFeelingConfidence ?? data.deal.gutFeeling?.sourceCount ?? 0}%</p></div><div><p className="text-[10px] text-muted-foreground">Bijdrage</p><p className="mono text-xl">{data.deal.score.gutFeelingContribution ?? 0}</p></div></div></div></div>}
      <InvestmentResult assessment={data.deal.score.assessment} />
      <DealAssumptionsEditor key={`${data.deal.dealId}:${data.deal.updatedAt}`} deal={data.deal} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={cardClass}>
          <div className="flex items-center gap-2"><Leaf size={16} className="text-[#287b6a]" /><h4 className="display text-xl font-bold">Energy → waarde</h4></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div><p className="text-[11px] text-muted-foreground">Jaarlijkse besparing</p><p className="mono mt-1 text-lg">{formatEuro(data.energy.annualSavings)}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Terugverdientijd</p><p className="mono mt-1 text-lg">{data.energy.paybackYears} jaar</p></div>
            <div><p className="text-[11px] text-muted-foreground">Herziene waarde</p><p className="mono mt-1 text-lg">{formatEuro(data.energy.revisedValue)}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Waardegroei-ROI (geen huurrendement)</p><p className="mono mt-1 text-lg text-[#287b6a]">{data.deal.score.assessment?.totalInvestment == null ? "Onvolledige kosten" : `${data.netRoi.netRoi.toFixed(1)}%`}</p></div>
          </div>
          <div className="mt-5 space-y-2">
            {data.energy.measures.map((measure) => <div key={measure.name} className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-xs"><span>{measure.name}</span><span className="mono text-[#287b6a]">+{formatEuro(measure.annualSavings)}/jr</span></div>)}
          </div>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2"><CircleDollarSign size={16} className="text-[#b56d19]" /><h4 className="display text-xl font-bold">Subsidies & beslissing</h4></div>
          <div className="mt-5 rounded-xl bg-[#f9f4e9] p-4"><p className="text-[11px] text-muted-foreground">Geschatte subsidie</p><p className="mono mt-1 text-2xl text-[#a4671c]">{formatEuro(data.subsidies.totalEstimatedAmount)}</p></div>
          <div className="mt-4 space-y-2">{data.subsidies.triggers.length === 0 ? <p className="text-xs text-muted-foreground">Geen triggers gevonden.</p> : data.subsidies.triggers.map((trigger) => <div key={trigger.code} className="flex gap-2 text-xs"><Check size={14} className="mt-0.5 shrink-0 text-[#287b6a]" /><span><strong>{trigger.name}</strong><br /><span className="text-muted-foreground">{trigger.reason}</span></span></div>)}</div>
          <p className={`mt-5 inline-flex rounded-full px-3 py-1 text-xs font-bold ${scoreColor(data.deal.score.totalScore)}`}>{data.deal.score.decision} · {data.deal.score.totalScore}/100</p>
        </div>
      </div>
      <div className={cardClass}>
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Handshake size={16} className="text-[#435a7b]" /><h4 className="display text-xl font-bold">Top investeerdersmatches</h4></div><span className="text-xs text-muted-foreground">max. 10</span></div>
        {matches.isLoading ? <LoadingBlock lines={3} /> : matches.isError ? <ErrorBlock onRetry={() => matches.refetch()} /> : matches.data?.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{matches.data.map((investor) => <div key={investor.investorId} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-3"><div><p className="text-sm font-bold">{investor.name}</p><p className="text-[11px] text-muted-foreground">{investor.company || "Particuliere investeerder"} · {investor.reasons.join(" · ") || "basis-match"}</p></div><span className={`mono rounded-lg px-2 py-1 text-sm font-medium ${scoreColor(investor.matchScore)}`}>{investor.matchScore}</span></div>)}</div> : <p className="mt-4 text-xs text-muted-foreground">Nog geen investeerdersprofielen beschikbaar.</p>}
      </div>
      <DealSignals dealId={dealId} />
    </div>
  );
}

function getPseudonymousVisitorId() {
  const key = "realestatex:visitor-id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const generated = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(key, generated);
  return generated;
}

function DealSignals({ dealId }: { dealId: string }) {
  const sales = useGetDealSalesIntelligence(dealId, { query: { enabled: Boolean(dealId), queryKey: getGetDealSalesIntelligenceQueryKey(dealId) } });
  const sentiment = useGetDealNeighborhoodSentiment(dealId, { query: { enabled: Boolean(dealId), queryKey: getGetDealNeighborhoodSentimentQueryKey(dealId) } });
  const media = useGetDealMediaBrief(dealId, { query: { enabled: Boolean(dealId), queryKey: getGetDealMediaBriefQueryKey(dealId) } });
  const refresh = useRefreshDealNeighborhoodSentiment();
  const record = useRecordVisitorIntentEvent();
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [articleIndex, setArticleIndex] = useState(0);

  const recordEvent = (eventType: "DEAL_VIEW" | "ROI_CALCULATOR" | "SUBSIDY_CALCULATOR" | "PDF_DOWNLOAD") => {
    if (!consent) {
      setNotice("Geef eerst expliciet toestemming voor pseudonieme intentmeting.");
      return;
    }
    record.mutate({ data: { visitorId: getPseudonymousVisitorId(), eventType, dealId, consent: true } }, {
      onSuccess: () => setNotice("Intentie-event veilig geregistreerd zonder persoonsgegevens."),
      onError: () => setNotice("Event kon niet worden geregistreerd. Probeer het later opnieuw."),
    });
  };

  return <div className="space-y-5">
    <div className="grid gap-5 xl:grid-cols-2">
      <div className={cardClass} data-testid="panel-deal-sales-intelligence">
        <div className="flex items-start justify-between gap-3"><div><p className="mono text-[10px] uppercase tracking-[0.18em] text-[#c17b21]">Visitor → sales</p><h4 className="display mt-2 text-xl font-bold">Kijkgedrag met context</h4></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${sales.data?.urgencyLevel === "HIGH" ? "bg-[#fae7e3] text-[#a4443b]" : "bg-[#e3f3ee] text-[#207464]"}`}>{sales.data?.urgencyLevel ?? "—"}</span></div>
        {sales.isLoading ? <LoadingBlock lines={3} /> : sales.isError ? <ErrorBlock onRetry={() => sales.refetch()} /> : sales.data ? <><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Bezoekers", sales.data.uniqueVisitors], ["Investeerders", sales.data.uniqueInvestors], ["Deal views", sales.data.dealViews], ["High intent", sales.data.highIntentCount]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-secondary p-3"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mono mt-2 text-xl font-medium">{value}</p></div>)}</div><div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span className="rounded-full border border-border px-2 py-1">ROI {sales.data.roiCalculatorInteractions}</span><span className="rounded-full border border-border px-2 py-1">Subsidie {sales.data.subsidyCalculatorInteractions}</span><span className="rounded-full border border-border px-2 py-1">PDF {sales.data.pdfDownloads}</span></div><p className="mt-4 text-xs leading-5 text-muted-foreground">{sales.data.investorViewText}</p></> : null}
        <div className="mt-5 border-t border-border pt-4"><label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 accent-[#287b6a]" data-testid="input-visitor-consent" />Ik geef expliciet toestemming om mijn bezoek aan deze deal pseudoniem te meten. Er worden geen naam, e-mail of andere persoonsgegevens gevraagd.</label><button onClick={() => recordEvent("DEAL_VIEW")} disabled={record.isPending} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60" data-testid="button-record-deal-view">Registreer deal-interesse</button>{notice && <p className="mt-2 text-xs font-semibold text-[#287b6a]" role="status" data-testid="status-visitor-event">{notice}</p>}</div>
      </div>
      <div className={cardClass} data-testid="panel-neighborhood-sentiment">
        <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Newspaper size={17} className="text-[#287b6a]" /><div><p className="mono text-[10px] uppercase tracking-[0.18em] text-[#287b6a]">Buurtbeeld</p><h4 className="display mt-2 text-xl font-bold">{sentiment.data?.narrativeTitle ?? "Nieuws & sentiment"}</h4></div></div><button onClick={() => refresh.mutate({ dealId }, { onSuccess: () => sentiment.refetch() })} disabled={refresh.isPending} className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50" aria-label="Ververs buurtbeeld" data-testid="button-refresh-sentiment"><RefreshCw size={15} /></button></div>
        {sentiment.isLoading ? <LoadingBlock lines={4} /> : sentiment.isError ? <ErrorBlock onRetry={() => sentiment.refetch()} /> : sentiment.data ? <><div className="mt-5 flex items-end gap-6"><div><p className="text-[10px] text-muted-foreground">Sentiment</p><p className="mono mt-1 text-3xl font-medium text-[#287b6a]">{sentiment.data.sentimentScore > 0 ? "+" : ""}{sentiment.data.sentimentScore.toFixed(2)}</p></div><div><p className="text-[10px] text-muted-foreground">Gut Feeling</p><p className="mono mt-1 text-3xl font-medium">{sentiment.data.gutFeelingScore}/100</p></div><div><p className="text-[10px] text-muted-foreground">Zekerheid</p><p className="mono mt-1 text-3xl font-medium">{sentiment.data.confidence}%</p></div></div><p className="mt-4 text-xs leading-5 text-muted-foreground">{sentiment.data.narrativeSummary}</p><div className="mt-4 flex flex-wrap gap-2">{sentiment.data.trends.slice(0, 4).map((trend) => <span key={trend.topic} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold">{trend.topic} · {trend.deltaPercent > 0 ? "+" : ""}{trend.deltaPercent}%</span>)}</div>{sentiment.data.articles.length > 0 && <div className="mt-4 rounded-xl border border-border bg-background p-3"><div className="flex items-start justify-between gap-3"><a href={sentiment.data.articles[articleIndex % sentiment.data.articles.length].url} target="_blank" rel="noreferrer" className="min-w-0 text-xs hover:underline" data-testid={`link-news-${sentiment.data.articles[articleIndex % sentiment.data.articles.length].articleId}`}><strong className="block truncate">{sentiment.data.articles[articleIndex % sentiment.data.articles.length].title}</strong><span className="mt-1 block text-muted-foreground">{sentiment.data.articles[articleIndex % sentiment.data.articles.length].source}</span></a><ExternalLink size={13} className="shrink-0 text-muted-foreground" /></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{sentiment.data.articles[articleIndex % sentiment.data.articles.length].summary}</p><div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-muted-foreground">{articleIndex + 1} / {sentiment.data.articles.length}</span><div className="flex gap-1"><button onClick={() => setArticleIndex((current) => (current - 1 + sentiment.data!.articles.length) % sentiment.data!.articles.length)} className="rounded-lg border border-border p-1.5 hover:bg-secondary" aria-label="Vorig nieuwsbericht" data-testid="button-news-prev"><ChevronLeft size={14} /></button><button onClick={() => setArticleIndex((current) => (current + 1) % sentiment.data!.articles.length)} className="rounded-lg border border-border p-1.5 hover:bg-secondary" aria-label="Volgend nieuwsbericht" data-testid="button-news-next"><ChevronRight size={14} /></button></div></div></div>}</> : <p className="mt-5 text-xs text-muted-foreground">Nog geen nieuws-snapshot beschikbaar.</p>}
      </div>
    </div>
    <div className={cardClass} data-testid="panel-media-brief">
      <div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#f7eddd] text-[#a4671c]"><ImageOff size={17} /></div><div><p className="mono text-[10px] uppercase tracking-[0.18em] text-[#a4671c]">Media brief</p><h4 className="display mt-1 text-xl font-bold">Provider-neutrale prompts</h4></div></div>
      {media.isLoading ? <div className="skeleton mt-5 h-16 rounded-xl" /> : media.isError ? <p className="mt-5 text-xs text-muted-foreground">Media brief tijdelijk niet beschikbaar.</p> : media.data ? <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-xl bg-secondary p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Voor</p><p className="mt-2 text-xs leading-5">{media.data.beforePrompt}</p></div><div className="rounded-xl bg-secondary p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Na</p><p className="mt-2 text-xs leading-5">{media.data.afterPrompt}</p></div><div className="rounded-xl bg-secondary p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Video loop</p><p className="mt-2 text-xs leading-5">{media.data.videoLoopPrompt}</p></div></div> : null}
      <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#a4671c]"><span className="h-2 w-2 rounded-full bg-[#c17b21]" />{media.data?.integrationStatus ?? "NOT_CONFIGURED"} · Geen render is uitgevoerd.</p>
    </div>
  </div>;
}

function PeopleWorkspace() {
  const client = useQueryClient();
  const investors = useListInvestors();
  const contacts = useListCrmContacts();
  const createInvestorMutation = useCreateInvestor();
  const createContactMutation = useCreateCrmContact();
  const createActivityMutation = useCreateCrmActivity();
  const [selectedContactId, setSelectedContactId] = useState("");
  const [selectedInvestorId, setSelectedInvestorId] = useState("");
  const recommendations = useGetInvestorRecommendations(selectedInvestorId, { query: { enabled: Boolean(selectedInvestorId), queryKey: getGetInvestorRecommendationsQueryKey(selectedInvestorId) } });
  const activities = useListCrmActivities(selectedContactId, {
    query: {
      queryKey: getListCrmActivitiesQueryKey(selectedContactId),
      enabled: Boolean(selectedContactId),
    },
  });
  const [investorForm, setInvestorForm] = useState<InvestorInput>({ name: "", email: "", budgetMin: 0, budgetMax: 0, riskProfile: "MEDIUM", preferredRegions: [], interests: [] });
  const [contactForm, setContactForm] = useState<CrmContactInput>({ type: "PARTNER", name: "", status: "ACTIVE" });
  const [activityForm, setActivityForm] = useState<CrmActivityInput>({ kind: "NOTE", summary: "" });
  const submitInvestor = (event: FormEvent) => {
    event.preventDefault();
    createInvestorMutation.mutate({ data: investorForm }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListInvestorsQueryKey() }); setInvestorForm({ name: "", email: "", budgetMin: 0, budgetMax: 0, riskProfile: "MEDIUM", preferredRegions: [], interests: [] }); } });
  };
  const submitContact = (event: FormEvent) => {
    event.preventDefault();
    createContactMutation.mutate({ data: contactForm }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListCrmContactsQueryKey() }); setContactForm({ type: "PARTNER", name: "", status: "ACTIVE" }); } });
  };
  const submitActivity = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedContactId) return;
    createActivityMutation.mutate(
      { contactId: selectedContactId, data: activityForm },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getListCrmActivitiesQueryKey(selectedContactId) });
          setActivityForm({ kind: "NOTE", summary: "" });
        },
      },
    );
  };
  return <div className="grid gap-5 xl:grid-cols-2">
    <div className={cardClass}>
      <div className="flex items-center gap-2"><Users size={17} className="text-[#435a7b]" /><h3 className="display text-xl font-bold">Investor Room</h3></div>
      <form onSubmit={submitInvestor} className="mt-4 space-y-3">
        <input required placeholder="Naam" value={investorForm.name} onChange={(event) => setInvestorForm({ ...investorForm, name: event.target.value })} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
        <input required type="email" placeholder="E-mail" value={investorForm.email} onChange={(event) => setInvestorForm({ ...investorForm, email: event.target.value })} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
        <div className="grid gap-3 sm:grid-cols-3">
          <input type="number" min="0" placeholder="Budget vanaf" value={investorForm.budgetMin} onChange={(event) => setInvestorForm({ ...investorForm, budgetMin: Number(event.target.value) })} className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          <input type="number" min="0" placeholder="Budget tot" value={investorForm.budgetMax} onChange={(event) => setInvestorForm({ ...investorForm, budgetMax: Number(event.target.value) })} className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          <select value={investorForm.riskProfile} onChange={(event) => setInvestorForm({ ...investorForm, riskProfile: event.target.value as InvestorInput["riskProfile"] })} className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm"><option value="LOW">Laag risico</option><option value="MEDIUM">Gemiddeld</option><option value="HIGH">Hoog risico</option></select>
        </div>
        <SubmitButton pending={createInvestorMutation.isPending}>Investeerder toevoegen</SubmitButton>
      </form>
       <div className="mt-5 space-y-2">{investors.isLoading ? <LoadingBlock lines={3} /> : (investors.data ?? []).map((investor) => <button key={investor.investorId} onClick={() => setSelectedInvestorId(investor.investorId)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs ${selectedInvestorId === investor.investorId ? "bg-primary/10 ring-1 ring-primary/20" : "bg-secondary"}`} data-testid={`button-investor-${investor.investorId}`}><span><strong>{investor.name}</strong><br /><span className="text-muted-foreground">{investor.riskProfile} · {formatEuro(investor.budgetMax)}</span></span><ShieldCheck size={15} className="text-[#287b6a]" /></button>)}</div>
       {selectedInvestorId && <div className="mt-5 border-t border-border pt-5" data-testid="panel-investor-recommendations"><div className="flex items-center justify-between"><div><p className="mono text-[10px] uppercase tracking-[0.16em] text-[#287b6a]">Profielmatch</p><p className="mt-1 text-sm font-bold">{recommendations.data?.greeting ?? "Persoonlijke aanbevelingen"}</p></div><span className="text-[10px] text-muted-foreground">max. 3 deals</span></div>{recommendations.isLoading ? <LoadingBlock lines={2} /> : recommendations.isError ? <p className="mt-3 text-xs text-muted-foreground">Aanbevelingen tijdelijk niet beschikbaar.</p> : <div className="mt-3 space-y-2">{(recommendations.data?.recommendations ?? []).map((deal) => <div key={deal.dealId} className="rounded-xl border border-[#d7e6e0] bg-[#f5faf7] p-3"><div className="flex items-start justify-between gap-3"><span className="text-xs font-bold">{deal.title}</span><span className="mono text-xs text-[#287b6a]">{deal.matchScore}</span></div><p className="mt-1 text-[11px] text-muted-foreground">{deal.region} · {formatEuro(deal.askingPrice)} · {deal.reasons.join(" · ")}</p></div>)}</div>}</div>}
    </div>
    <div className={cardClass}>
      <div className="flex items-center gap-2"><Contact size={17} className="text-[#b56d19]" /><h3 className="display text-xl font-bold">CRM-relaties</h3></div>
      <form onSubmit={submitContact} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2"><input required placeholder="Naam" value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm" /><select value={contactForm.type} onChange={(event) => setContactForm({ ...contactForm, type: event.target.value as CrmContactInput["type"] })} className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm"><option value="INVESTOR">Investeerder</option><option value="MAKELAAR">Makelaar</option><option value="PARTNER">Partner</option></select></div>
        <input type="email" placeholder="E-mail (optioneel)" value={contactForm.email ?? ""} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
        <textarea placeholder="Notitie" value={contactForm.notes ?? ""} onChange={(event) => setContactForm({ ...contactForm, notes: event.target.value })} className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
        <SubmitButton pending={createContactMutation.isPending}>Relatie toevoegen</SubmitButton>
      </form>
      <div className="mt-5 space-y-2">{contacts.isLoading ? <LoadingBlock lines={3} /> : (contacts.data ?? []).map((contact) => <button key={contact.contactId} onClick={() => setSelectedContactId(contact.contactId)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs ${selectedContactId === contact.contactId ? "bg-primary/10 ring-1 ring-primary/20" : "bg-secondary"}`}><span><strong>{contact.name}</strong><br /><span className="text-muted-foreground">{contact.type} · {contact.company || "zonder bedrijf"}</span></span><Contact size={15} className="text-[#b56d19]" /></button>)}</div>
      {selectedContactId && <div className="mt-5 border-t border-border pt-5">
        <div className="flex items-center justify-between"><p className="text-xs font-bold">Communicatiehistorie</p><span className="text-[10px] text-muted-foreground">{activities.data?.length ?? 0} items</span></div>
        <form onSubmit={submitActivity} className="mt-3 flex gap-2">
          <select value={activityForm.kind} onChange={(event) => setActivityForm({ ...activityForm, kind: event.target.value as CrmActivityInput["kind"] })} className="rounded-xl border border-input bg-background px-2 py-2 text-xs"><option value="NOTE">Notitie</option><option value="CALL">Call</option><option value="EMAIL">E-mail</option><option value="MEETING">Meeting</option></select>
          <input required placeholder="Nieuwe interactie" value={activityForm.summary} onChange={(event) => setActivityForm({ ...activityForm, summary: event.target.value })} className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-xs" />
          <button type="submit" disabled={createActivityMutation.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Plus size={15} /></button>
        </form>
        <div className="mt-3 space-y-2">{activities.isLoading ? <LoadingBlock lines={2} /> : (activities.data ?? []).slice(0, 4).map((activity) => <div key={activity.activityId} className="rounded-xl border border-border bg-background px-3 py-2 text-xs"><div className="flex justify-between gap-2"><span className="font-bold">{activity.kind}</span><span className="text-muted-foreground">{new Date(activity.occurredAt ?? activity.createdAt).toLocaleDateString("nl-NL")}</span></div><p className="mt-1 text-muted-foreground">{activity.summary}</p></div>)}</div>
      </div>}
    </div>
  </div>;
}

export function DealingRoom() {
  const [location] = useLocation();
  const initialDealId = new URLSearchParams(location.split("?")[1] ?? "").get("deal") ?? "";
  const [selectedDealId, setSelectedDealId] = useState(initialDealId);
  const [active, setActive] = useState<"deals" | "people">("deals");
  const deals = useListDeals({ query: { queryKey: getListDealsQueryKey() } });
  const overview = useGetEnterpriseOverview({ query: { queryKey: getGetEnterpriseOverviewQueryKey(), staleTime: 30000 } });
  const tier = useGetSaasEntitlements(undefined, { query: { queryKey: getGetSaasEntitlementsQueryKey(), staleTime: 300000 } });
  const billing = useGetSaasBillingStatus({ query: { queryKey: getGetSaasBillingStatusQueryKey(), staleTime: 300000 } });
  const visitorSummary = useGetVisitorIntentSummary({ days: 30 }, { query: { queryKey: getGetVisitorIntentSummaryQueryKey({ days: 30 }), staleTime: 30000 } });
  const selected = useMemo(() => (deals.data ?? []).find((deal) => deal.dealId === selectedDealId), [deals.data, selectedDealId]);
  return <AppShell><div className="animate-rise">
    <SectionHeading eyebrow="Enterprise Core · Fase 2–8" title="Dealing Room" description="Van object naar dealbeslissing: score, verduurzaming, subsidie, rendement en investeerder in één werkruimte." action={<div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full bg-[#3eaf94]" /> {tier.data?.label ?? "Tier laden"}</div>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Deals" value={String(overview.data?.counts.deals ?? deals.data?.length ?? 0)} detail={`${overview.data?.goDeals ?? 0} met GO-besluit`} icon={Handshake} />
      <Metric label="Gemiddelde score" value={`${overview.data?.averageDealScore ?? 0}/100`} detail="Vijf scorecomponenten" icon={Gauge} />
      <Metric label="Investeerders" value={String(overview.data?.counts.investors ?? 0)} detail="Beschikbaar voor matching" icon={Users} />
      <Metric label="CRM-relaties" value={String(overview.data?.counts.crmContacts ?? 0)} detail="Investeerders, makelaars, partners" icon={Contact} />
    </div>
    <div className="mt-5 rounded-2xl border border-[#d7e6e0] bg-[#f5faf7] p-5" data-testid="panel-visitor-lead-summary"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="mono text-[10px] uppercase tracking-[0.18em] text-[#287b6a]">Intent summary · laatste 30 dagen</p><h3 className="display mt-1 text-xl font-bold">Van interesse naar opvolging</h3></div><span className="text-xs text-muted-foreground">{visitorSummary.data ? `Bijgewerkt ${new Date(visitorSummary.data.asOf).toLocaleDateString("nl-NL")}` : "Samenvatting laden"}</span></div>{visitorSummary.isLoading ? <div className="mt-4 grid gap-3 sm:grid-cols-4"><div className="skeleton h-16 rounded-xl" /><div className="skeleton h-16 rounded-xl" /><div className="skeleton h-16 rounded-xl" /><div className="skeleton h-16 rounded-xl" /></div> : visitorSummary.isError ? <p className="mt-4 text-xs text-muted-foreground">Lead-samenvatting tijdelijk niet beschikbaar.</p> : <><div className="mt-4 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-white/70 p-3"><p className="text-[10px] text-muted-foreground">Events</p><p className="mono mt-2 text-2xl">{visitorSummary.data?.eventsCount ?? 0}</p></div><div className="rounded-xl bg-white/70 p-3"><p className="text-[10px] text-muted-foreground">Unieke bezoekers</p><p className="mono mt-2 text-2xl">{visitorSummary.data?.uniqueVisitors ?? 0}</p></div><div className="rounded-xl bg-white/70 p-3"><p className="text-[10px] text-muted-foreground">Investeerders</p><p className="mono mt-2 text-2xl">{visitorSummary.data?.uniqueInvestors ?? 0}</p></div><div className="rounded-xl bg-white/70 p-3"><p className="text-[10px] text-muted-foreground">Hoge intent</p><p className="mono mt-2 text-2xl text-[#287b6a]">{visitorSummary.data?.leads.filter((lead) => lead.intentLevel === "HIGH").length ?? 0}</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-3">{(visitorSummary.data?.leads ?? []).slice(0, 3).map((lead) => <div key={lead.visitorId} className="rounded-xl border border-[#d7e6e0] bg-white/50 p-3" data-testid={`card-visitor-lead-${lead.visitorId}`}><div className="flex items-center justify-between"><span className="mono text-[10px] text-muted-foreground">{lead.visitorId.slice(0, 8)}…</span><span className="text-[10px] font-bold text-[#287b6a]">{lead.intentLevel}</span></div><p className="mono mt-2 text-lg">{lead.score}<span className="text-[10px] text-muted-foreground"> / 100</span></p><p className="mt-1 text-[10px] text-muted-foreground">{lead.eventCount} interacties · laatst gezien {new Date(lead.lastSeen).toLocaleDateString("nl-NL")}</p></div>)}</div></>}</div>
    <div className="mt-6 flex gap-2 rounded-2xl border border-border bg-card p-2">
      <button onClick={() => setActive("deals")} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold ${active === "deals" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}><Handshake size={15} /> Deals</button>
      <button onClick={() => setActive("people")} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold ${active === "people" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}><Users size={15} /> Investor Room & CRM</button>
    </div>
    {active === "people" ? <div className="mt-6"><PeopleWorkspace /></div> : <div className="mt-6 grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <div className="space-y-4">
        <DealForm onCreated={setSelectedDealId} />
        <div className={cardClass}>
          <div className="mb-4 flex items-center justify-between"><div><p className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Pipeline</p><h3 className="display mt-2 text-2xl font-bold tracking-[-0.05em]">Actieve deals</h3></div><span className="text-xs text-muted-foreground">{deals.data?.length ?? 0} totaal</span></div>
          {deals.isLoading ? <LoadingBlock lines={5} /> : deals.isError ? <ErrorBlock onRetry={() => deals.refetch()} /> : deals.data?.length ? <div className="space-y-2">{deals.data.map((deal) => <button key={deal.dealId} onClick={() => setSelectedDealId(deal.dealId)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedDealId === deal.dealId ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-secondary"}`}><div className="flex items-start justify-between gap-3"><span><span className="block text-sm font-bold">{deal.title}</span><span className="mt-1 block text-[11px] text-muted-foreground">{deal.region} · {formatEuro(deal.askingPrice)}</span></span><span className={`mono rounded-lg px-2 py-1 text-sm ${scoreColor(deal.score.totalScore)}`}>{deal.score.totalScore}</span></div></button>)}</div> : <EmptyBlock title="Nog geen deals" description="Maak de eerste deal vanuit een object." />}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-8"><DealDetail dealId={selected?.dealId ?? selectedDealId} /></div>
    </div>}
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#d6e9e3] bg-[#f0f8f5] p-4 text-xs text-[#287b6a]"><Sparkles size={16} /><span>Enterprise Core registreert wijzigingen per tenant in de audit chain; browservelden kunnen tenant-identiteit niet overschrijven.</span><span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 font-semibold">{billing.data?.configured ? `Billing: ${billing.data.provider}` : "Billingprovider nog niet gekoppeld"}</span><ArrowDownToLine size={15} className="opacity-50" /></div>
  </div></AppShell>;
}