import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, customFetch } from '@workspace/api-client-react';
import { Activity, Sparkles, Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { EmptyBlock, ErrorBlock, LoadingBlock, SectionHeading } from '@/components/ui-elements';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUSES = [
  { value: 'new', label: 'Nieuw' },
  { value: 'contacted', label: 'Benaderd' },
  { value: 'qualified', label: 'Gekwalificeerd' },
  { value: 'won', label: 'Gewonnen' },
  { value: 'lost', label: 'Verloren' },
] as const;

type Lead = { id: string; name: string; email: string; phone: string | null; company: string | null; status: string; leadScore: number; createdAt: string; metadata: Record<string, unknown> };
type Analytics = {
  last24h: { pageViews: number; sessions: number };
  activeSessions: number;
  topPages: Array<{ page: string; views: number }>;
  tools: Array<{ tool: string; views: number }>;
  recent: Array<{ page: string; eventType: string; referrer: string | null; timestamp: string }>;
};
type Feed = { id: string; leadId: string; leadName: string; actionType: string; notes: string | null; aiGeneratedSummary: string | null; createdAt: string };

const get = <T,>(url: string) => customFetch<T>(url, { method: 'GET' });
const when = (value: string) => new Date(value).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
const errorText = (error: unknown) => (error instanceof ApiError && error.status === 403 ? 'Alleen beheerders hebben toegang tot Sales & CRM.' : 'De gegevens konden niet worden geladen.');

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 70 ? 'bg-[#e3f3ee] text-[#207464]' : score >= 50 ? 'bg-[#f7eddd] text-[#9a6419]' : 'bg-secondary text-muted-foreground';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`} data-testid="badge-lead-score">Score {score}</span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-border bg-card p-5"><p className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="display mt-2 text-3xl font-bold tracking-[-0.05em]" data-testid={`stat-${label}`}>{value}</p></div>;
}

function TrafficTab() {
  const query = useQuery({ queryKey: ['sales', 'analytics'], queryFn: () => get<Analytics>('/api/sales/analytics'), refetchInterval: 15_000 });
  if (query.isPending) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock message={errorText(query.error)} onRetry={() => query.refetch()} />;
  const data = query.data;
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat label="Actieve sessies (5 min)" value={data.activeSessions} />
      <Stat label="Bezoeken (24 uur)" value={data.last24h.pageViews} />
      <Stat label="Sessies (24 uur)" value={data.last24h.sessions} />
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-5"><h3 className="text-sm font-bold">Populaire tools</h3>
        {data.tools.length ? <ul className="mt-4 space-y-2">{data.tools.map((row) => <li key={row.tool} className="flex justify-between text-sm"><span>{row.tool}</span><span className="font-bold">{row.views}</span></li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">Nog geen toolbezoeken gemeten.</p>}</section>
      <section className="rounded-2xl border border-border bg-card p-5"><h3 className="text-sm font-bold">Populaire pagina’s</h3>
        {data.topPages.length ? <ul className="mt-4 space-y-2">{data.topPages.map((row) => <li key={row.page} className="flex justify-between text-sm"><span className="truncate">{row.page}</span><span className="font-bold">{row.views}</span></li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">Nog geen bezoeken gemeten.</p>}</section>
    </div>
    <section className="rounded-2xl border border-border bg-card p-5"><h3 className="text-sm font-bold">Laatste bezoeken</h3>
      {data.recent.length ? <ul className="mt-4 divide-y divide-border text-xs">{data.recent.map((row, index) => <li key={index} className="flex justify-between gap-4 py-2"><span className="truncate">{row.page}{row.referrer ? ` · via ${row.referrer}` : ''}</span><span className="shrink-0 text-muted-foreground">{when(row.timestamp)}</span></li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">Zodra bezoekers meetinstemming geven, verschijnen ze hier.</p>}</section>
  </div>;
}

function PipelineTab() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['sales', 'leads'], queryFn: () => get<Lead[]>('/api/sales/leads') });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => customFetch(`/api/sales/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ['sales'] }); },
  });
  if (query.isPending) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock message={errorText(query.error)} onRetry={() => query.refetch()} />;
  if (!query.data.length) return <EmptyBlock title="Nog geen leads" description="Aanvragen via het formulier op de startpagina verschijnen hier." />;
  return <div>
    {move.isError && <p className="mb-3 text-xs font-semibold text-[#a4443b]" role="alert">De status kon niet worden gewijzigd.</p>}
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5" data-testid="kanban-board">
      {STATUSES.map((column) => {
        const leads = query.data.filter((lead) => lead.status === column.value);
        return <section key={column.value} className="rounded-2xl border border-border bg-secondary/40 p-3" aria-label={column.label}>
          <h3 className="mb-3 flex justify-between px-1 text-xs font-bold">{column.label}<span className="text-muted-foreground">{leads.length}</span></h3>
          <div className="space-y-2">{leads.map((lead) => <article key={lead.id} className="rounded-xl border border-border bg-card p-3" data-testid={`lead-card-${lead.id}`}>
            <div className="flex items-start justify-between gap-2"><p className="text-sm font-bold">{lead.name}</p><ScoreBadge score={lead.leadScore} /></div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{lead.company || lead.email}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{when(lead.createdAt)}</p>
            <label className="mt-2 block text-[10px] font-semibold">Status
              <select value={lead.status} disabled={move.isPending} onChange={(event) => move.mutate({ id: lead.id, status: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs">{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </label>
          </article>)}</div>
        </section>;
      })}
    </div>
  </div>;
}

function AssistantTab() {
  const queryClient = useQueryClient();
  const leads = useQuery({ queryKey: ['sales', 'leads'], queryFn: () => get<Lead[]>('/api/sales/leads') });
  const feed = useQuery({ queryKey: ['sales', 'assistant'], queryFn: () => get<Feed[]>('/api/sales/assistant') });
  const [busyId, setBusyId] = useState<string | null>(null);
  const recommend = useMutation({
    mutationFn: (id: string) => customFetch(`/api/sales/leads/${id}/ai-recommendation`, { method: 'POST' }),
    onMutate: (id) => setBusyId(id),
    onSettled: () => { setBusyId(null); void queryClient.invalidateQueries({ queryKey: ['sales', 'assistant'] }); },
  });
  if (feed.isPending || leads.isPending) return <LoadingBlock />;
  if (feed.isError || leads.isError) return <ErrorBlock message={errorText(feed.error ?? leads.error)} onRetry={() => { void feed.refetch(); void leads.refetch(); }} />;
  const open = leads.data.filter((lead) => lead.status === 'new' || lead.status === 'contacted' || lead.status === 'qualified');
  return <div className="grid gap-6 lg:grid-cols-2">
    <section className="rounded-2xl border border-border bg-card p-5"><h3 className="text-sm font-bold">Aanbeveling opvragen</h3>
      <p className="mt-1 text-xs text-muted-foreground">De AI krijgt geen e-mailadres of telefoonnummer te zien.</p>
      {recommend.isError && <p className="mt-3 text-xs font-semibold text-[#a4443b]" role="alert" data-testid="text-ai-error">De AI-aanbeveling kon niet worden opgehaald.</p>}
      {open.length ? <ul className="mt-4 space-y-2">{open.map((lead) => <li key={lead.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{lead.name} <ScoreBadge score={lead.leadScore} /></span>
        <button onClick={() => recommend.mutate(lead.id)} disabled={busyId !== null} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-60" data-testid={`button-ai-${lead.id}`}><Sparkles size={12} />{busyId === lead.id ? 'Bezig…' : 'Advies'}</button></li>)}</ul> : <p className="mt-4 text-xs text-muted-foreground">Geen open leads.</p>}</section>
    <section className="rounded-2xl border border-border bg-card p-5"><h3 className="text-sm font-bold">Aanbevelingen en activiteit</h3>
      {feed.data.length ? <ul className="mt-4 space-y-3" data-testid="assistant-feed">{feed.data.map((item) => <li key={item.id} className="rounded-xl bg-secondary/50 p-3 text-xs"><div className="flex justify-between gap-3"><span className="font-bold">{item.leadName}{item.aiGeneratedSummary ? ' · AI-advies' : ''}</span><span className="shrink-0 text-muted-foreground">{when(item.createdAt)}</span></div><p className="mt-1 leading-5">{item.aiGeneratedSummary ?? item.notes}</p></li>)}</ul> : <p className="mt-4 text-xs text-muted-foreground">Nog geen activiteit.</p>}</section>
  </div>;
}

export function SalesEngine() {
  return <AppShell>
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <SectionHeading eyebrow="Sales & CRM" title="Sales Engine" description="Bezoekers, leads en AI-opvolgadvies op één plek." />
      <Tabs defaultValue="traffic">
        <TabsList>
          <TabsTrigger value="traffic" data-testid="tab-traffic"><Activity size={14} className="mr-1.5" />Verkeer</TabsTrigger>
          <TabsTrigger value="pipeline" data-testid="tab-pipeline"><Users size={14} className="mr-1.5" />Lead pipeline</TabsTrigger>
          <TabsTrigger value="assistant" data-testid="tab-assistant"><Sparkles size={14} className="mr-1.5" />AI Sales Assistant</TabsTrigger>
        </TabsList>
        <TabsContent value="traffic" className="mt-6"><TrafficTab /></TabsContent>
        <TabsContent value="pipeline" className="mt-6"><PipelineTab /></TabsContent>
        <TabsContent value="assistant" className="mt-6"><AssistantTab /></TabsContent>
      </Tabs>
    </div>
  </AppShell>;
}
