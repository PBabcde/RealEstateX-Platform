import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Check,
  Download,
  FilePenLine,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  getListPropertiesQueryKey,
  getTrainingGetScenarioQueryKey,
  getTrainingListScenariosQueryKey,
  trainingDownloadInvestorReadySheet,
  useListProperties,
  useTrainingCreateScenario,
  useTrainingGetScenario,
  useTrainingListScenarios,
  useTrainingPromoteScenario,
  useTrainingRefreshScenarioSentiment,
  useTrainingUpdateScenario,
} from "@workspace/api-client-react";
import type { TrainingScenario, TrainingScenarioInput, TrainingScenarioUpdate } from "@workspace/api-client-react";
import { AppShell } from "@/components/app-shell";
import { EmptyBlock, ErrorBlock, LoadingBlock, SectionHeading, formatEuro, formatNumber } from "@/components/ui-elements";

const cardClass = "rounded-2xl border border-border bg-card p-5 shadow-xs";
type FormState = {
  propertyId: string;
  title: string;
  region: string;
  askingPrice: string;
  renovationCost: string;
  expectedValue: string;
  monthlyRent: string;
  municipality: string;
};

const blankForm: FormState = {
  propertyId: "",
  title: "",
  region: "",
  askingPrice: "",
  renovationCost: "0",
  expectedValue: "",
  monthlyRent: "0",
  municipality: "",
};

const formFromScenario = (scenario: TrainingScenario): FormState => ({
  propertyId: scenario.propertyId,
  title: scenario.title,
  region: scenario.region,
  askingPrice: String(scenario.askingPrice),
  renovationCost: String(scenario.renovationCost),
  expectedValue: String(scenario.expectedValue),
  monthlyRent: String(scenario.monthlyRent),
  municipality: scenario.municipality ?? "",
});

export function TrainingRoom() {
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const properties = useListProperties({ query: { queryKey: getListPropertiesQueryKey(), staleTime: 60000 } });
  const scenarios = useTrainingListScenarios({ query: { queryKey: getTrainingListScenariosQueryKey(), staleTime: 30000 } });
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<FormState>(blankForm);
  const [savedMessage, setSavedMessage] = useState("");
  const [promotion, setPromotion] = useState<{ scenarioId: string; dealId: string } | null>(null);
  const detail = useTrainingGetScenario(selectedId, { query: { enabled: Boolean(selectedId), queryKey: getTrainingGetScenarioQueryKey(selectedId) } });
  const create = useTrainingCreateScenario();
  const update = useTrainingUpdateScenario();
  const promote = useTrainingPromoteScenario();
  const refresh = useTrainingRefreshScenarioSentiment();

  const selectedProperty = useMemo(() => properties.data?.find((property) => property.propertyId === form.propertyId), [properties.data, form.propertyId]);
  const activeScenario = detail.data ?? scenarios.data?.find((scenario) => scenario.scenarioId === selectedId);

  const selectScenario = (scenarioId: string) => {
    setSelectedId(scenarioId);
    setSavedMessage("");
    const scenario = scenarios.data?.find((item) => item.scenarioId === scenarioId);
    if (scenario) setForm(formFromScenario(scenario));
  };

  const selectProperty = (propertyId: string) => {
    const property = properties.data?.find((item) => item.propertyId === propertyId);
    setForm((current) => ({
      ...current,
      propertyId,
      title: current.title || property?.adres || "",
      region: current.region || property?.adres || "",
      expectedValue: current.expectedValue || "",
    }));
  };

  const updateField = (key: keyof FormState) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const payload = (): TrainingScenarioInput => ({
    propertyId: form.propertyId,
    title: form.title.trim(),
    region: form.region.trim(),
    askingPrice: Number(form.askingPrice),
    renovationCost: Number(form.renovationCost),
    expectedValue: Number(form.expectedValue),
    monthlyRent: Number(form.monthlyRent),
    ...(form.municipality.trim() ? { municipality: form.municipality.trim() } : {}),
  });

  const save = (event: FormEvent) => {
    event.preventDefault();
    setSavedMessage("");
    if (selectedId) {
      const { propertyId: _propertyId, ...editable } = payload();
      update.mutate({ scenarioId: selectedId, data: editable as TrainingScenarioUpdate }, {
        onSuccess: (scenario) => {
          client.setQueryData(getTrainingGetScenarioQueryKey(selectedId), scenario);
          client.invalidateQueries({ queryKey: getTrainingListScenariosQueryKey() });
          setForm(formFromScenario(scenario));
          setSavedMessage("Scenario opgeslagen. De Quality Gate is opnieuw door de server berekend.");
        },
      });
    } else {
      create.mutate({ data: payload() }, {
        onSuccess: (scenario) => {
          client.invalidateQueries({ queryKey: getTrainingListScenariosQueryKey() });
          setSelectedId(scenario.scenarioId);
          setForm(formFromScenario(scenario));
          setSavedMessage("Scenario aangemaakt. Bekijk nu de server-berekende Quality Gate.");
        },
      });
    }
  };

  const refreshSentiment = () => {
    if (!selectedId) return;
    refresh.mutate({ scenarioId: selectedId }, {
      onSuccess: (response) => {
        client.setQueryData(getTrainingGetScenarioQueryKey(selectedId), response.scenario);
        client.invalidateQueries({ queryKey: getTrainingListScenariosQueryKey() });
        setForm(formFromScenario(response.scenario));
        setSavedMessage("Nieuws en sentiment ververst; de score komt opnieuw van de server.");
      },
    });
  };

  const promoteScenario = () => {
    if (!selectedId) return;
    promote.mutate({ scenarioId: selectedId }, {
      onSuccess: (response) => {
        setPromotion({ scenarioId: response.scenario.scenarioId, dealId: response.deal.dealId });
        client.setQueryData(getTrainingGetScenarioQueryKey(selectedId), response.scenario);
        client.invalidateQueries({ queryKey: getTrainingListScenariosQueryKey() });
        setSavedMessage("Scenario gepromoveerd. De dealing room deal staat klaar.");
      },
    });
  };

  const downloadPdf = async (scenarioId: string) => {
    const blob = await trainingDownloadInvestorReadySheet(scenarioId);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scenarioId}-investor-ready-sheet.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const formBusy = create.isPending || update.isPending;
  return <AppShell>
    <div className="animate-rise">
      <SectionHeading eyebrow="Decision practice · server-led" title="Training Room" description="Bouw renovatiescenario’s op toegankelijke objecten. De server toetst de kwaliteit, ververst het buurtbeeld en bewaakt promotie." action={<Link href="/dealing-room" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold hover:bg-secondary" data-testid="link-training-dealing-room">Naar Dealing Room <ArrowRight size={14} /></Link>} />
      {savedMessage && <div className="mb-5 flex items-center gap-2 rounded-xl border border-[#cde4da] bg-[#f0f8f5] px-4 py-3 text-xs font-semibold text-[#287b6a]" role="status" data-testid="status-training-success"><Check size={15} />{savedMessage}</div>}
      {create.isError || update.isError || promote.isError || refresh.isError ? <div className="mb-5"><ErrorBlock message="De server kon deze actie niet afronden. Controleer de scenariowaarden en probeer opnieuw." onRetry={() => { create.reset(); update.reset(); promote.reset(); refresh.reset(); }} /></div> : null}
      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <aside className="space-y-4">
          <div className={cardClass}>
            <div className="flex items-start justify-between gap-3"><div><p className="mono text-[10px] uppercase tracking-[0.18em] text-[#c17b21]">Scenario desk</p><h3 className="display mt-2 text-2xl font-bold tracking-[-0.05em]">Je oefencases</h3></div><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#f7eddd] text-[#a4671c]"><GraduationCap size={17} /></div></div>
            {scenarios.isLoading ? <div className="mt-5"><LoadingBlock lines={4} /></div> : scenarios.isError ? <div className="mt-5"><ErrorBlock onRetry={() => scenarios.refetch()} /></div> : scenarios.data?.length ? <div className="mt-5 space-y-2">{scenarios.data.map((scenario) => <button key={scenario.scenarioId} onClick={() => selectScenario(scenario.scenarioId)} className={`w-full rounded-xl border p-3 text-left ${selectedId === scenario.scenarioId ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-secondary"}`} data-testid={`button-scenario-${scenario.scenarioId}`}><div className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block truncate text-sm font-bold">{scenario.title}</span><span className="mt-1 block text-[11px] text-muted-foreground">{scenario.region} · {scenario.propertyType}</span></span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${scenario.status === "PROMOTED" ? "bg-[#dcefe8] text-[#287b6a]" : scenario.qualityGatePassed ? "bg-[#e3f3ee] text-[#207464]" : "bg-[#faeedc] text-[#a4671c]"}`}>{scenario.status}</span></div><div className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>Score</span><span className="mono font-bold text-foreground">{scenario.score.totalScore}/100</span></div></button>)}</div> : <div className="mt-5"><EmptyBlock title="Nog geen scenario" description="Start met een toegankelijk object en test een renovatiebeslissing." /></div>}
            <button onClick={() => { setSelectedId(""); setForm(blankForm); setSavedMessage(""); setPromotion(null); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground" data-testid="button-new-training-scenario"><Sparkles size={15} />Nieuw scenario</button>
          </div>
          <div className="rounded-2xl border border-[#d7e6e0] bg-[#f5faf7] p-5"><div className="flex items-start gap-3"><ShieldCheck size={17} className="mt-0.5 text-[#287b6a]" /><div><p className="text-sm font-bold">Server als scheidsrechter</p><p className="mt-2 text-xs leading-5 text-muted-foreground">De browser geeft geen Quality Gate of promotie vrij. Alleen de server kan een scenario READY maken of promoveren.</p></div></div></div>
        </aside>
        <section className="space-y-5">
          <form onSubmit={save} className={cardClass}>
            <div className="flex items-start justify-between gap-4"><div><p className="mono text-[10px] uppercase tracking-[0.18em] text-[#c17b21]">{selectedId ? "Scenario bewerken" : "Nieuwe oefencase"}</p><h3 className="display mt-2 text-2xl font-bold">{activeScenario?.title ?? "Renovatiecase opzetten"}</h3></div>{selectedId && <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold">{activeScenario?.status ?? "LADEN"}</span>}</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold sm:col-span-2">Toegankelijk object<select required value={form.propertyId} onChange={(event) => selectProperty(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" data-testid="select-training-property"><option value="">Kies een object</option>{(properties.data ?? []).map((property) => <option key={property.propertyId} value={property.propertyId}>{property.adres} · {property.type} · {property.energielabel}</option>)}</select></label>
              <label className="text-xs font-semibold">Titel<input required maxLength={160} value={form.title} onChange={(event) => updateField("title")(event.target.value)} placeholder="Energietransitie bovenwoning" className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" data-testid="input-training-title" /></label>
              <label className="text-xs font-semibold">Regio<input required maxLength={120} value={form.region} onChange={(event) => updateField("region")(event.target.value)} placeholder="Utrecht Oost" className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" data-testid="input-training-region" /></label>
              <label className="text-xs font-semibold">Vraagprijs<input required type="number" min="1" value={form.askingPrice} onChange={(event) => updateField("askingPrice")(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" data-testid="input-training-asking-price" /></label>
              <label className="text-xs font-semibold">Verwachte waarde<input required type="number" min="1" value={form.expectedValue} onChange={(event) => updateField("expectedValue")(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" data-testid="input-training-expected-value" /></label>
              <label className="text-xs font-semibold">Renovatie<input type="number" min="0" value={form.renovationCost} onChange={(event) => updateField("renovationCost")(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" data-testid="input-training-renovation-cost" /></label>
              <label className="text-xs font-semibold">Huur per maand<input type="number" min="0" value={form.monthlyRent} onChange={(event) => updateField("monthlyRent")(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" data-testid="input-training-monthly-rent" /></label>
              <label className="text-xs font-semibold sm:col-span-2">Gemeente<input value={form.municipality} onChange={(event) => updateField("municipality")(event.target.value)} placeholder={selectedProperty?.adres ?? "Optioneel"} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" data-testid="input-training-municipality" /></label>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row"><button type="submit" disabled={formBusy || !properties.data?.length} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-training-scenario"><FilePenLine size={15} />{formBusy ? "Opslaan..." : selectedId ? "Wijzigingen opslaan" : "Scenario berekenen"}</button>{selectedId && <button type="button" onClick={refreshSentiment} disabled={refresh.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-bold hover:bg-secondary disabled:opacity-50" data-testid="button-refresh-training-sentiment"><RefreshCw size={15} />{refresh.isPending ? "Verversen..." : "Ververs buurtbeeld"}</button>}</div>
          </form>
          {detail.isLoading && selectedId ? <LoadingBlock lines={6} /> : activeScenario && <QualityGate scenario={activeScenario} onPromote={promoteScenario} promoting={promote.isPending} promotion={promotion} onDownload={downloadPdf} onOpenDeal={() => promotion && setLocation(`/dealing-room?deal=${promotion.dealId}`)} />}
        </section>
      </div>
    </div>
  </AppShell>;
}

function QualityGate({ scenario, onPromote, promoting, promotion, onDownload, onOpenDeal }: { scenario: TrainingScenario; onPromote: () => void; promoting: boolean; promotion: { scenarioId: string; dealId: string } | null; onDownload: (scenarioId: string) => Promise<void>; onOpenDeal: () => void }) {
  const components = [
    ["Flits", scenario.score.flitsScore],
    ["Split", scenario.score.splitScore],
    ["Transformatie", scenario.score.transformationScore],
    ["Energie", scenario.score.energyScore],
    ["Subsidies", scenario.score.subsidyScore],
  ];
  return <div className={cardClass} data-testid="panel-training-quality-gate"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="mono text-[10px] uppercase tracking-[0.18em] text-[#287b6a]">Quality Gate · server computed</p><h3 className="display mt-2 text-2xl font-bold">Beslissen met bewijs</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">De browser toont alleen de uitkomst van de server. De gate wordt hier niet opnieuw berekend.</p></div><div className={`rounded-2xl px-4 py-3 text-center ${scenario.qualityGatePassed ? "bg-[#dcefe8] text-[#207464]" : "bg-[#faeedc] text-[#a4671c]"}`}><p className="text-[10px] font-bold uppercase tracking-[0.12em]">{scenario.qualityGatePassed ? "Passed" : "Review nodig"}</p><p className="mono mt-1 text-3xl font-medium">{scenario.score.totalScore}<span className="text-sm">/100</span></p></div></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">{components.map(([label, value]) => <div key={String(label)} className="rounded-xl bg-secondary p-3"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mono mt-2 text-xl">{value}</p></div>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-border p-3"><p className="text-[10px] text-muted-foreground">Besluit</p><p className="mt-1 text-sm font-bold">{scenario.score.decision}</p></div><div className="rounded-xl border border-border p-3"><p className="text-[10px] text-muted-foreground">Marge</p><p className="mono mt-1 text-sm">{formatEuro(scenario.score.margin)}</p></div><div className="rounded-xl border border-border p-3"><p className="text-[10px] text-muted-foreground">Bruto yield</p><p className="mono mt-1 text-sm">{scenario.score.grossYield.toFixed(1)}%</p></div><div className="rounded-xl border border-border p-3"><p className="text-[10px] text-muted-foreground">Woonoppervlak</p><p className="mono mt-1 text-sm">{formatNumber(scenario.woonoppervlak)} m²</p></div></div>{scenario.gutFeeling && <div className="mt-4 rounded-xl bg-[#f5faf7] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#287b6a]">Gut Feeling · {scenario.gutFeeling.region}</p><div className="mt-2 flex flex-wrap gap-4 text-xs"><span>Sentiment <strong>{scenario.gutFeeling.sentimentScore.toFixed(2)}</strong></span><span>Score <strong>{scenario.gutFeeling.gutFeelingScore}/100</strong></span><span>Zekerheid <strong>{scenario.gutFeeling.confidence}%</strong></span><span>{scenario.gutFeeling.articleCount} artikelen</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{scenario.gutFeeling.narrativeSummary}</p></div>}<div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">{scenario.status !== "PROMOTED" && <button onClick={onPromote} disabled={promoting || !scenario.qualityGatePassed} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#287b6a] px-4 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-promote-training-scenario"><ShieldCheck size={15} />{promoting ? "Promoveren..." : scenario.qualityGatePassed ? "Promoveer naar Dealing Room" : "Quality Gate nog niet gehaald"}</button>}{(promotion || scenario.status === "PROMOTED") && <><button onClick={onOpenDeal} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-bold hover:bg-secondary" data-testid="button-open-promoted-deal"><ArrowRight size={15} />Open deal</button><button onClick={() => onDownload(scenario.scenarioId)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-bold hover:bg-secondary" data-testid="button-download-training-sheet"><Download size={15} />Download Investor Ready Sheet</button></>}</div></div>;
}