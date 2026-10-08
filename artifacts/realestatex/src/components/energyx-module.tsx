import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, customFetch } from '@workspace/api-client-react';
import { useUser } from '@clerk/react';
import { Download, Loader2, RefreshCw, X, Zap } from 'lucide-react';
import { ErrorBlock, formatEuro, formatNumber, LoadingBlock } from '@/components/ui-elements';
import { exportEnergyxReport } from '@/components/energyx-report';

type Status = { propertyId: string; status: 'not_synced' | 'synced' | 'outdated' | 'failed'; syncedAt?: string; specs?: Record<string, string | number | null> };
type B2B = {
  view: 'b2b'; syncedAt: string;
  building: { type: string; areaM2: number; buildYear: number; energyLabel: string };
  specs: { heatingKw: number; coolingKw: number; roofAreaM2: number; connection: string | null; glazing: string | null; woz: number | null; wwsPoints: number | null; wwsPointsGain: number | null };
  metrics: { sustainabilityScore: number; solar: { panels: number; kwp: number; kwhPerYear: number }; battery: { kwh: number }; annualSavings: number; paybackYears: number | null; investments: { total: number } };
  technicalReport: { summary: string; comfortLevel: string };
  maintenance: { status: string; nextCheck: string };
  quoteIndication: { min: number; max: number };
};
type B2C = { view: 'b2c'; monthlySavingsEur: number; sustainabilityScore: number; comfortImprovement: string; paybackYears: number | null };

const api = <T,>(url: string, body?: unknown) => customFetch<T>(url, body === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(body) });
const STATUS_LABEL: Record<Status['status'], { text: string; color: string }> = {
  not_synced: { text: 'Niet gesynchroniseerd', color: 'bg-[#eceae4] text-[#6b665c]' },
  synced: { text: 'Gesynchroniseerd', color: 'bg-[#e3f3ee] text-[#207464]' },
  outdated: { text: 'Verouderd — opnieuw synchroniseren', color: 'bg-[#faeedc] text-[#b56d19]' },
  failed: { text: 'Synchronisatie mislukt', color: 'bg-[#fae7e3] text-[#a4443b]' },
};
const numberOrNull = (form: FormData, key: string) => { const v = String(form.get(key) ?? '').trim(); return v === '' ? null : Number(v); };

export function EnergyXModule({ propertyId, adres, onClose }: { propertyId: string; adres: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [view, setView] = useState<'b2b' | 'b2c'>('b2b');
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [serviceDialog, setServiceDialog] = useState<'service' | 'maintenance' | null>(null);
  const preferenceKey = user?.id ? `energyx:view:${user.id}:${propertyId}` : null;
  useEffect(() => {
    if (!preferenceKey) {
      setView('b2b');
      return;
    }
    try {
      const savedView = window.localStorage.getItem(preferenceKey);
      setView(savedView === 'b2c' ? 'b2c' : 'b2b');
    } catch {
      setView('b2b');
    }
  }, [preferenceKey]);
  const statusKey = ['energyx', 'status', propertyId];
  const status = useQuery({ queryKey: statusKey, queryFn: () => api<Status>(`/api/v1/energyx/status/${propertyId}`), refetchInterval: 20_000 });
  const synced = status.data?.status === 'synced' || status.data?.status === 'outdated';
  const metrics = useQuery({
    queryKey: ['energyx', 'metrics', propertyId, view, status.data?.syncedAt],
    queryFn: () => api<B2B | B2C>(`/api/v1/energyx/metrics/${propertyId}?view=${view}`),
    enabled: synced,
  });
  const sync = useMutation({
    mutationFn: (specs: Record<string, unknown>) => api(`/api/v1/energyx/sync`, { propertyId, consent, specs }),
    onSuccess: () => { setNotice(null); void queryClient.invalidateQueries({ queryKey: ['energyx'] }); },
  });
  const request = useMutation({
    mutationFn: (payload: { kind: 'service' | 'maintenance'; note: string }) =>
      api<{ requestId: string; kind: string; status: string }>(`/api/v1/energyx/service-request`, { propertyId, ...payload }),
    onSuccess: () => setNotice('Je aanvraag is ontvangen.'),
  });
  const chooseView = (nextView: 'b2b' | 'b2c') => {
    setView(nextView);
    if (preferenceKey) {
      try {
        window.localStorage.setItem(preferenceKey, nextView);
      } catch {
        // The switch remains usable when browser storage is unavailable.
      }
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    sync.mutate({
      woz: numberOrNull(form, 'woz'), wwsPoints: numberOrNull(form, 'wwsPoints'), wwsPointsGain: numberOrNull(form, 'wwsPointsGain'), glazing: String(form.get('glazing') ?? '') || null,
      heatingKw: numberOrNull(form, 'heatingKw'), coolingKw: numberOrNull(form, 'coolingKw'), roofAreaM2: numberOrNull(form, 'roofAreaM2'), connection: String(form.get('connection') ?? ''),
    });
  };
  const badge = status.data ? STATUS_LABEL[status.data.status] : undefined;
  const input = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-xs';
  const syncError = sync.error instanceof ApiError ? (sync.error.data as { error?: string } | null)?.error : undefined;

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#101a2b]/50 p-4 backdrop-blur-sm" role="dialog" aria-modal={serviceDialog ? undefined : true} aria-label={serviceDialog ? 'Service of onderhoud aanvragen' : 'EnergyX Verduurzamingsmodule'} data-testid="dialog-energyx">
    <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><p className="mono text-[10px] uppercase tracking-[0.2em] text-[#c17b21]">EnergyX</p><h2 className="display text-xl font-bold">Verduurzamingsmodule</h2><p className="mt-1 text-xs text-muted-foreground">{adres}</p></div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-secondary" aria-label="Sluiten"><X size={16} /></button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="energyx-status">
        {badge && <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${badge.color}`}>{badge.text}</span>}
        {status.data?.syncedAt && <span className="text-[11px] text-muted-foreground">Laatste sync {new Date(status.data.syncedAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</span>}
      </div>
      <p className="mb-4 rounded-lg bg-[#f7eddd] px-3 py-2 text-[11px] leading-5 text-[#7a5413]">Indicatieve berekening binnen RealEstateX. Er is nog geen live verbinding met EnergyX; de cijfers zijn schattingen.</p>
      {status.isLoading && <LoadingBlock lines={2} />}
      {status.isError && <ErrorBlock message="De synchronisatiestatus kon niet worden geladen." onRetry={() => status.refetch()} />}
      <form onSubmit={submit} className="mb-5 space-y-3 rounded-xl border border-border p-4">
        <p className="text-xs font-bold">Gegevens voor synchronisatie</p>
        <p className="text-[11px] text-muted-foreground">Adres, oppervlakte, bouwjaar en energielabel komen uit het object. Vul hieronder aan wat je kent.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-[11px]">WOZ (€)<input name="woz" type="number" min="0" className={input} /></label>
          <label className="text-[11px]">WWS-punten<input name="wwsPoints" type="number" min="0" className={input} /></label>
          <label className="text-[11px]">Indicatieve WWS-puntenwinst<input name="wwsPointsGain" type="number" min="0" step="1" className={input} /></label>
          <label className="text-[11px]">Beglazing<select name="glazing" className={input} defaultValue=""><option value="">Onbekend</option><option value="enkel">Enkel</option><option value="dubbel">Dubbel</option><option value="hr++">HR++</option><option value="drievoudig">Drievoudig</option></select></label>
          <label className="text-[11px]">Verwarming (kW)<input name="heatingKw" type="number" min="0" step="0.1" className={input} /></label>
          <label className="text-[11px]">Koeling (kW)<input name="coolingKw" type="number" min="0" step="0.1" className={input} /></label>
          <label className="text-[11px]">Dakoppervlak (m²)<input name="roofAreaM2" type="number" min="0" className={input} /></label>
          <label className="col-span-2 text-[11px] sm:col-span-3">Elektriciteitsaansluiting<input name="connection" placeholder="bijv. 3x25A" className={input} /></label>
        </div>
        <label className="flex items-start gap-2 text-[11px] leading-5"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" data-testid="checkbox-energyx-consent" />Ik geef toestemming dat de gegevens van dit object worden gebruikt voor EnergyX-berekeningen.</label>
        {syncError && <p className="text-[11px] text-[#a4443b]" role="alert">{syncError}</p>}
        {sync.isError && !syncError && <p className="text-[11px] text-[#a4443b]" role="alert">Synchroniseren is mislukt. Probeer het opnieuw.</p>}
        <button type="submit" disabled={!consent || sync.isPending} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-energyx-sync">{sync.isPending ? <Loader2 size={14} className="animate-spin" /> : synced ? <RefreshCw size={14} /> : <Zap size={14} />}{synced ? 'Opnieuw synchroniseren' : 'Synchroniseren'}</button>
      </form>
      {synced && <div>
        <div className="mb-3 inline-flex rounded-xl border border-border p-1" role="tablist" aria-label="Weergave">
          {(['b2b', 'b2c'] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => chooseView(v)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`} data-testid={`tab-energyx-${v}`}>{v === 'b2b' ? 'B2B · Beheerder/investeerder' : 'B2C · Huurder/eigenaar'}</button>)}
        </div>
        {metrics.isLoading && <LoadingBlock lines={3} />}
        {metrics.isError && <ErrorBlock message="De EnergyX-gegevens konden niet worden geladen." onRetry={() => metrics.refetch()} />}
        {metrics.data?.view === 'b2b' && <B2BPanel data={metrics.data} onRequest={() => { setNotice(null); setServiceDialog('maintenance'); }} />}
        {metrics.data?.view === 'b2c' && <B2CPanel data={metrics.data} onRequest={() => { setNotice(null); setServiceDialog('service'); }} />}
      </div>}
    </div>
    {serviceDialog && <ServiceRequestDialog
      kind={serviceDialog}
      pending={request.isPending}
      success={request.isSuccess}
      error={request.isError}
      onClose={() => { setServiceDialog(null); request.reset(); }}
      onSubmit={(note) => request.mutate({ kind: serviceDialog, note })}
    />}
  </div>;
}

const Stat = ({ label, value }: { label: string; value: string }) => <div className="rounded-xl bg-background p-3"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mono mt-1 text-sm font-bold">{value}</p></div>;

function B2BPanel({ data, onRequest }: { data: B2B; onRequest: () => void }) {
  const m = data.metrics;
  return <div className="space-y-3" data-testid="energyx-b2b">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Stat label="Zonnepanelen" value={`${m.solar.panels} st · ${m.solar.kwp} kWp`} />
      <Stat label="Opbrengst" value={`${formatNumber(m.solar.kwhPerYear)} kWh/jaar`} />
      <Stat label="Batterij" value={`${m.battery.kwh} kWh`} />
      <Stat label="Verwarming" value={`${data.specs.heatingKw} kW`} />
      <Stat label="Koeling" value={`${data.specs.coolingKw} kW`} />
      <Stat label="Dakoppervlak" value={`${formatNumber(data.specs.roofAreaM2)} m²`} />
      <Stat label="Besparing" value={`${formatEuro(m.annualSavings)}/jaar`} />
      <Stat label="Terugverdientijd" value={m.paybackYears ? `${m.paybackYears} jaar` : '—'} />
      <Stat label="Score" value={`${m.sustainabilityScore}/100`} />
    </div>
    <div className="rounded-xl border border-border p-3 text-xs leading-5"><p className="font-bold">Technisch adviesrapport</p><p className="mt-1 text-muted-foreground">{data.technicalReport.summary}</p><p className="mt-2">Onderhoud: <b>{data.maintenance.status}</b> · volgende controle {data.maintenance.nextCheck}</p><p className="mt-1">Offerte-indicatie: <b>{formatEuro(data.quoteIndication.min)} – {formatEuro(data.quoteIndication.max)}</b></p></div>
    <div className="flex flex-wrap gap-2">
      <button onClick={() => exportEnergyxReport(adresFromReport(data), data)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90" data-testid="button-energyx-export"><Download size={14} /> Verduurzamingsrapport exporteren / PDF</button>
      <button onClick={onRequest} className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-secondary">Onderhoudsaanvraag indienen</button>
    </div>
  </div>;
}

function B2CPanel({ data, onRequest }: { data: B2C; onRequest: () => void }) {
  return <div className="space-y-3" data-testid="energyx-b2c">
    <div className="grid grid-cols-2 gap-2"><Stat label="Besparing per maand" value={formatEuro(data.monthlySavingsEur)} /><Stat label="Verduurzamingsscore" value={`${data.sustainabilityScore}/100`} /></div>
    <p className="rounded-xl border border-border p-3 text-xs leading-5 text-muted-foreground">{data.comfortImprovement}{data.paybackYears ? ` Verwachte terugverdientijd: ${data.paybackYears} jaar.` : ''}</p>
    <button onClick={onRequest} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground" data-testid="button-energyx-service">Service of onderhoud aanvragen</button>
  </div>;
}
