import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, customFetch, useGetAccount, type CrmContactRecord, type SalesPartnerCategory, type VisitorIntentSummary } from '@workspace/api-client-react';
import { Activity, ArrowRight, BookOpen, CheckCircle2, Handshake, Mail, Megaphone, MousePointerClick, PenLine, Search, Share2, Sparkles, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { Link } from 'wouter';
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
type PartnerRole = 'makelaar' | 'adviseur' | 'investeerder' | 'installateur' | 'partner';
const PARTNER_CATEGORY_LABELS: Record<SalesPartnerCategory, string> = {
  warmtepompen: 'Warmtepompen', airco: 'Airco', buy_to_let: 'Buy-to-Let', makelaar: 'Makelaar',
  adviseur: 'Adviseur', vve: 'VvE-beheerder of adviseur', investeerder: 'Investeerder', overig: 'Overig',
};

const get = <T,>(url: string) => customFetch<T>(url, { method: 'GET' });
const when = (value: string) => new Date(value).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
const errorText = (error: unknown) => (error instanceof ApiError && error.status === 403 ? 'Alleen beheerders hebben toegang tot Sales & CRM.' : 'De gegevens konden niet worden geladen.');
const roleLabels: Record<PartnerRole, string> = {
  makelaar: 'Vastgoedprofessional / makelaar',
  adviseur: 'Adviseur',
  investeerder: 'Investeerder',
  installateur: 'Installateur',
  partner: 'Samenwerkingspartner',
};

function StatCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: LucideIcon }) {
  return <div className="rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><p className="mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p><Icon size={15} className="text-[#68816f]" /></div><p className="display mt-2 text-3xl font-bold tracking-[-0.05em]" data-testid={`stat-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}>{value}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p></div>;
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 70 ? 'bg-[#e3f3ee] text-[#207464]' : score >= 50 ? 'bg-[#f7eddd] text-[#9a6419]' : 'bg-secondary text-muted-foreground';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`} data-testid="badge-lead-score">Score {score}</span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-border bg-card p-5"><p className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="display mt-2 text-3xl font-bold tracking-[-0.05em]" data-testid={`stat-${label}`}>{value}</p></div>;
}

function TrafficTab() {
  const query = useQuery({ queryKey: ['sales', 'analytics'], queryFn: () => get<Analytics>('/api/sales/analytics'), refetchInterval: 15_000 });
  const intent = useQuery({ queryKey: ['sales', 'visitor-intent', 30], queryFn: () => get<VisitorIntentSummary>('/api/visitor-intent/summary?days=30'), refetchInterval: 60_000 });
  if (query.isPending) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock message={errorText(query.error)} onRetry={() => query.refetch()} />;
  const data = query.data;
  const intentData = intent.data;
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
    <section className="rounded-2xl border border-border bg-card p-5" data-testid="visitor-intent-summary">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold">Bezoekersintentie · laatste 30 dagen</h3><p className="mt-1 text-xs text-muted-foreground">Geaggregeerde activiteit; bezoekers blijven pseudoniem.</p></div><MousePointerClick size={17} className="text-[#68816f]" /></div>
      {intent.isPending ? <p className="mt-4 text-xs text-muted-foreground">Intent-signalen laden…</p> : intent.isError ? <p className="mt-4 text-xs text-muted-foreground" role="status">Intent-signalen zijn tijdelijk niet beschikbaar.</p> : intentData ? <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <IntentMetric label="Bezoekers" value={intentData.uniqueVisitors} />
        <IntentMetric label="Signalen" value={intentData.eventsCount} />
        <IntentMetric label="Hoge intentie" value={intentData.leads.filter((lead) => lead.intentLevel === 'HIGH').length} />
        <IntentMetric label="PDF-downloads" value={intentData.interactionCounts.PDF_DOWNLOAD ?? 0} />
      </div> : null}
    </section>
  </div>;
}

function IntentMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-secondary/50 px-3 py-2.5"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>;
}

function OverviewTab() {
  const leads = useQuery({ queryKey: ['sales', 'leads'], queryFn: () => get<Lead[]>('/api/sales/leads') });
  const analytics = useQuery({ queryKey: ['sales', 'analytics'], queryFn: () => get<Analytics>('/api/sales/analytics'), refetchInterval: 15_000 });
  const intent = useQuery({ queryKey: ['sales', 'visitor-intent', 30], queryFn: () => get<VisitorIntentSummary>('/api/visitor-intent/summary?days=30'), refetchInterval: 60_000 });
  const contacts = useQuery({ queryKey: ['sales', 'crm-contacts'], queryFn: () => get<CrmContactRecord[]>('/api/crm/contacts') });
  const failed = leads.isError ? leads.error : analytics.isError ? analytics.error : contacts.isError ? contacts.error : null;
  if (leads.isPending || analytics.isPending || contacts.isPending) return <LoadingBlock />;
  if (failed) return <ErrorBlock message={errorText(failed)} onRetry={() => { void leads.refetch(); void analytics.refetch(); void contacts.refetch(); }} />;
  const allLeads = leads.data ?? [];
  const won = allLeads.filter((lead) => lead.status === 'won').length;
  const conversion = allLeads.length ? Math.round((won / allLeads.length) * 100) : 0;
  const activeLeads = allLeads.filter((lead) => ['new', 'contacted', 'qualified'].includes(lead.status)).length;
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Nieuwe relaties" value={allLeads.filter((lead) => lead.status === 'new').length} detail="Nieuwe aanvragen in de pipeline" icon={Users} />
      <StatCard label="Opvolging open" value={activeLeads} detail="Nieuw, benaderd of gekwalificeerd" icon={Activity} />
      <StatCard label="Conversie" value={`${conversion}%`} detail={`${won} gewonnen van ${allLeads.length} leads`} icon={CheckCircle2} />
      <StatCard label="CRM-contacten" value={contacts.data?.length ?? 0} detail="Bestaande contacten en partners" icon={Handshake} />
      <StatCard label="Bezoekersintentie" value={intent.data?.uniqueVisitors ?? '—'} detail="Pseudonieme bezoekers · 30 dagen" icon={MousePointerClick} />
    </div>
    <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-[#68816f]">Eerste overzicht</p><h3 className="mt-1 text-base font-bold">Aandacht in de pipeline</h3></div><UsersRound size={17} className="text-[#68816f]" /></div>
        {allLeads.length ? <ul className="mt-4 divide-y divide-border">{allLeads.slice(0, 5).map((lead) => <li key={lead.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-xs font-bold">{lead.name}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{String(lead.metadata?.interest ?? 'Interesse niet vastgelegd')} · {String(lead.metadata?.source ?? 'bron onbekend')}</p></div><span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold">{STATUSES.find((item) => item.value === lead.status)?.label ?? lead.status}</span></li>)}</ul> : <p className="mt-4 text-xs text-muted-foreground">Nieuwe aanvragen verschijnen hier zodra ze via het bestaande formulier binnenkomen.</p>}
        <p className="mt-4 border-t border-border pt-3 text-[10px] text-muted-foreground">Verkeer in 24 uur: {analytics.data?.last24h.pageViews ?? 0} bezoeken · {analytics.data?.last24h.sessions ?? 0} sessies</p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-[#68816f]">Bestaande werkruimtes</p><h3 className="mt-1 text-base font-bold">Van interesse naar relatie</h3></div><ArrowRight size={17} className="text-[#68816f]" /></div>
        <div className="mt-4 grid gap-2">
          <Link href="/innovation-center" className="flex min-h-11 items-center justify-between rounded-xl border border-border px-3 text-xs font-semibold hover:bg-secondary/50" data-testid="link-sales-innovation">Innovation Center-inzendingen <ArrowRight size={14} /></Link>
          <Link href="/control-room" className="flex min-h-11 items-center justify-between rounded-xl border border-border px-3 text-xs font-semibold hover:bg-secondary/50" data-testid="link-sales-control-room">Control Room-status <ArrowRight size={14} /></Link>
        </div>
        <p className="mt-4 text-[10px] leading-5 text-muted-foreground">Inzendingen en partnerinteresse uit het Innovation Center staan als contacten in hetzelfde tenantgebonden CRM.</p>
      </section>
    </div>
  </div>;
}

function LeadFollowup({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const followup = useMutation({
    mutationFn: () => customFetch(`/api/sales/leads/${leadId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: note }) }),
    onSuccess: () => { setNote(''); setSaved(true); void queryClient.invalidateQueries({ queryKey: ['sales', 'assistant'] }); },
  });
  return <details className="mt-3 border-t border-border pt-2">
    <summary className="cursor-pointer text-[10px] font-semibold text-[#537863]">Opvolging noteren</summary>
    <form className="mt-2 space-y-2" onSubmit={(event) => { event.preventDefault(); setSaved(false); followup.mutate(); }}>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} required rows={2} aria-label="Notitie voor opvolging" placeholder="Leg de volgende stap vast…" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] leading-4 outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid={`input-followup-${leadId}`} />
      {followup.isError && <p className="text-[10px] text-destructive" role="alert">De opvolging kon niet worden opgeslagen.</p>}
      {saved && <p className="text-[10px] text-[#287b6a]" role="status">Opvolging opgeslagen in het bestaande CRM.</p>}
      <button type="submit" disabled={followup.isPending || !note.trim()} className="min-h-8 rounded-lg bg-primary px-3 text-[10px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-followup-${leadId}`}>{followup.isPending ? 'Opslaan…' : 'Notitie opslaan'}</button>
    </form>
  </details>;
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
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Interesse: {typeof lead.metadata?.interest === 'string' ? lead.metadata.interest : 'Niet vastgelegd'}<br />Bron: {typeof lead.metadata?.source === 'string' ? lead.metadata.source : 'Onbekend'}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{when(lead.createdAt)}</p>
            <label className="mt-2 block text-[10px] font-semibold">Status
              <select value={lead.status} disabled={move.isPending} onChange={(event) => move.mutate({ id: lead.id, status: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs">{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </label>
            <LeadFollowup leadId={lead.id} />
          </article>)}</div>
        </section>;
      })}
    </div>
  </div>;
}

function PartnersTab() {
  const queryClient = useQueryClient();
  const contacts = useQuery({ queryKey: ['sales', 'crm-contacts'], queryFn: () => get<CrmContactRecord[]>('/api/crm/contacts') });
  const [formVersion, setFormVersion] = useState(0);
  const [partnerCategory, setPartnerCategory] = useState<SalesPartnerCategory>('overig');
  const create = useMutation({
    mutationFn: (input: { role: PartnerRole; name: string; email: string; phone: string; company: string }) => {
      const type = input.role === 'investeerder' ? 'INVESTOR' : input.role === 'makelaar' ? 'MAKELAAR' : 'PARTNER';
      return customFetch<CrmContactRecord>('/api/crm/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name: input.name, ...(input.email ? { email: input.email } : {}), ...(input.phone ? { phone: input.phone } : {}), ...(input.company ? { company: input.company } : {}), partnerCategory, status: 'ACTIVE', notes: `Sales Engine rol: ${roleLabels[input.role]}` }) });
    },
    onSuccess: () => { setFormVersion((version) => version + 1); void queryClient.invalidateQueries({ queryKey: ['sales', 'crm-contacts'] }); void queryClient.invalidateQueries({ queryKey: ['listCrmContacts'] }); },
  });
  const [role, setRole] = useState<PartnerRole>('partner');
  if (contacts.isPending) return <LoadingBlock />;
  if (contacts.isError) return <ErrorBlock message={errorText(contacts.error)} onRetry={() => contacts.refetch()} />;
  return <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9eee6] text-[#607765]"><Handshake size={17} /></span><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-[#68816f]">Bestaand CRM</p><h3 className="mt-1 text-base font-bold">Relatie of partner toevoegen</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Wordt opgeslagen als CRM-contact; geen aparte partnerlijst.</p></div></div>
      <form key={formVersion} className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); create.mutate({ role, name: String(form.get('name') ?? '').trim(), email: String(form.get('email') ?? '').trim(), phone: String(form.get('phone') ?? '').trim(), company: String(form.get('company') ?? '').trim() }); }}>
        <label className="block text-[10px] font-semibold">Rol
          <select value={role} onChange={(event) => setRole(event.target.value as PartnerRole)} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-partner-role">{Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </label>
        <label className="block text-[10px] font-semibold">Expertisegebied voor AI-aanbevelingen
          <select value={partnerCategory} onChange={(event) => setPartnerCategory(event.target.value as SalesPartnerCategory)} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-sales-partner-category">{Object.entries(PARTNER_CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </label>
        <label className="block text-[10px] font-semibold">Naam *
          <input name="name" required maxLength={200} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-partner-name" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[10px] font-semibold">Organisatie
            <input name="company" maxLength={200} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" />
          </label>
          <label className="block text-[10px] font-semibold">Telefoon
            <input name="phone" maxLength={40} autoComplete="tel" className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" />
          </label>
        </div>
        <label className="block text-[10px] font-semibold">E-mailadres
          <input name="email" type="email" maxLength={254} autoComplete="email" className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" />
        </label>
        {create.isError && <p className="text-xs text-destructive" role="alert">Het CRM-contact kon niet worden opgeslagen.</p>}
        {create.isSuccess && <p className="text-xs text-[#287b6a]" role="status">Contact toegevoegd aan het bestaande CRM.</p>}
        <button type="submit" disabled={create.isPending} className="min-h-10 w-full rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-60" data-testid="button-create-partner">{create.isPending ? 'Opslaan…' : 'Contact opslaan'}</button>
      </form>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-[#68816f]">Relaties</p><h3 className="mt-1 text-base font-bold">Contacten en samenwerkingspartners</h3></div><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold">{contacts.data.length} contacten</span></div>
      {contacts.data.length ? <div className="mt-4 space-y-2">{contacts.data.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((contact) => <article key={contact.contactId} className="rounded-xl border border-border p-3" data-testid={`crm-contact-${contact.contactId}`}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-bold">{contact.name}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{contact.company || contact.email || 'Geen organisatiegegevens'}</p></div><span className="rounded-full bg-secondary px-2 py-1 text-[9px] font-bold">{contact.status === 'ACTIVE' ? 'Actief' : 'Inactief'} · {contact.type === 'INVESTOR' ? 'Investeerder' : contact.type === 'MAKELAAR' ? 'Makelaar' : 'Partner'}</span></div>{contact.notes && <p className="mt-2 whitespace-pre-line text-[10px] leading-4 text-muted-foreground">{contact.notes.slice(0, 360)}</p>}</article>)}</div> : <EmptyBlock title="Nog geen CRM-contacten" description="Inzendingen uit het Innovation Center en nieuwe partners komen hier samen." />}
      <Link href="/innovation-center" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-[11px] font-semibold hover:bg-secondary/50">Bekijk Innovation Center <ArrowRight size={14} /></Link>
    </section>
  </div>;
}

const marketingFormats = [
  { icon: BookOpen, title: 'Blogs', detail: 'Redactionele onderwerpen en concepten', status: 'Voorbereid' },
  { icon: Search, title: 'SEO-pagina’s', detail: 'Zoekintentie en landingspagina-structuur', status: 'Voorbereid' },
  { icon: Mail, title: 'Nieuwsbrieven', detail: 'Doelgroep en uitgaveplanning', status: 'Voorbereid' },
  { icon: Megaphone, title: 'Campagnes', detail: 'Doel, kanaal en resultaatmeting', status: 'Niet actief' },
  { icon: Share2, title: 'Social media', detail: 'Kanalen en publicatieformats', status: 'Voorbereid' },
];

function GrowthPreparationTab() {
  const contacts = useQuery({ queryKey: ['sales', 'crm-contacts'], queryFn: () => get<CrmContactRecord[]>('/api/crm/contacts') });
  if (contacts.isPending) return <LoadingBlock />;
  if (contacts.isError) return <ErrorBlock message={errorText(contacts.error)} onRetry={() => contacts.refetch()} />;
  const earlyAdopters = contacts.data.filter((contact) => /Beta-tester\s*\/\s*early-adopter interesse:\s*Ja/i.test(contact.notes ?? '')).length;
  return <div className="space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9eee6] text-[#607765]"><PenLine size={17} /></span><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-[#68816f]">Content & marketing</p><h3 className="mt-1 text-base font-bold">Voorbereide formats</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Structuur voor toekomstige content; er worden geen campagnes verstuurd of ingepland.</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{marketingFormats.map(({ icon: Icon, title, detail, status }) => <article key={title} className="rounded-xl border border-border bg-background p-4" data-testid={`marketing-format-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}><span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-[#607765]"><Icon size={15} /></span><h4 className="mt-3 text-xs font-bold">{title}</h4><p className="mt-1 min-h-8 text-[10px] leading-4 text-muted-foreground">{detail}</p><span className="mt-3 inline-flex rounded-full bg-secondary px-2 py-1 text-[9px] font-semibold">{status}</span></article>)}</div>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9eee6] text-[#607765]"><UsersRound size={17} /></span><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-[#68816f]">Premium & community</p><h3 className="mt-1 text-base font-bold">Lidmaatschap en bijdragen voorbereid</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Deze labels activeren geen toegang, abonnement of betaling. Er zijn geen Stripe-wijzigingen uitgevoerd.</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CommunityCard label="Early adopters" value={earlyAdopters} detail="Afgeleid uit toestemming in bestaande Innovation Center-contacten." />
        <CommunityCard label="Premium gebruikers" value="Niet geactiveerd" detail="Geen premium-toegang of betaalstatus gewijzigd." />
        <CommunityCard label="Founding members" value="Voorbereid" detail="Nog niet apart vastgelegd in gebruikersprofielen." />
        <CommunityCard label="Vrijwillige bijdragen" value="Voorbereid" detail="Geen betaalverzoek of betaalverwerking actief." />
      </div>
      {contacts.data.length === 0 && <p className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground"><MousePointerClick size={13} /> Contacten uit het Innovation Center worden hier meegenomen zodra ze bestaan.</p>}
    </section>
  </div>;
}

function CommunityCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <article className="rounded-xl border border-border bg-background p-4" data-testid={`community-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}><p className="text-[10px] font-semibold text-muted-foreground">{label}</p><p className="mt-2 text-lg font-bold">{value}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p></article>;
}

function AssistantTab() {
  return <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9eee6] text-[#607765]"><Sparkles size={18} /></span><div><h3 className="text-base font-bold">Berichtvoorstellen op verzoek</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Maak een bewerkbaar concept voor een huiseigenaar, VvE, makelaar of belegger. Concepten worden niet aan leads opgeslagen en er wordt niets verzonden.</p></div></div>
    <Link href="/control-room/content-autopilot" className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground" data-testid="link-sales-content-autopilot"><Sparkles size={14} /> Open contentassistent <ArrowRight size={14} /></Link>
  </section>;
}

export function SalesEngine() {
  const account = useGetAccount();
  if (account.isPending) return <AppShell><LoadingBlock /></AppShell>;
  if (account.isError) return <AppShell><ErrorBlock message="Je toegangsrechten konden niet worden gecontroleerd." onRetry={() => account.refetch()} /></AppShell>;
  if (account.data.role !== 'admin') return <AppShell><EmptyBlock title="Alleen voor beheerders" description="Sales & CRM is alleen beschikbaar voor beheerders van deze tenant." /></AppShell>;
  return <AppShell>
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <SectionHeading eyebrow="Sales & CRM" title="Sales Engine" description="Bestaande bezoekerssignalen, leads, opvolging en CRM-relaties op één plek." />
      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview" data-testid="tab-overview"><Activity size={14} className="mr-1.5" />Overzicht</TabsTrigger>
          <TabsTrigger value="traffic" data-testid="tab-traffic"><Activity size={14} className="mr-1.5" />Verkeer</TabsTrigger>
          <TabsTrigger value="pipeline" data-testid="tab-pipeline"><Users size={14} className="mr-1.5" />Lead pipeline</TabsTrigger>
          <TabsTrigger value="partners" data-testid="tab-partners"><Handshake size={14} className="mr-1.5" />CRM &amp; partners</TabsTrigger>
          <TabsTrigger value="growth" data-testid="tab-growth"><Megaphone size={14} className="mr-1.5" />Groei voorbereiden</TabsTrigger>
          <TabsTrigger value="assistant" data-testid="tab-assistant"><Sparkles size={14} className="mr-1.5" />Contentassistent</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6"><OverviewTab /></TabsContent>
        <TabsContent value="traffic" className="mt-6"><TrafficTab /></TabsContent>
        <TabsContent value="pipeline" className="mt-6"><PipelineTab /></TabsContent>
        <TabsContent value="partners" className="mt-6"><PartnersTab /></TabsContent>
        <TabsContent value="growth" className="mt-6"><GrowthPreparationTab /></TabsContent>
        <TabsContent value="assistant" className="mt-6"><AssistantTab /></TabsContent>
      </Tabs>
    </div>
  </AppShell>;
}
