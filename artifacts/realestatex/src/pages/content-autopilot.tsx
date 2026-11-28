import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, customFetch, type CrmContactRecord, type SalesContentOptions, type SalesContentType, type SalesPartnerCategory } from "@workspace/api-client-react";
import { ArrowLeft, Check, Copy, Handshake, Pencil, Send, Sparkles, Users } from "lucide-react";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { EmptyBlock, ErrorBlock, LoadingBlock, SectionHeading } from "@/components/ui-elements";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Lead = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: string;
  leadScore: number;
  createdAt: string;
  metadata: Record<string, unknown>;
};
type DraftResult = {
  contentType: SalesContentType;
  draft: string;
  partnerCategory: SalesPartnerCategory;
  partnerName?: string | null;
  dealTitle?: string | null;
};
type EditablePartner = CrmContactRecord;
type PartnerFormValue = {
  contactId?: string;
  partnerCategory: SalesPartnerCategory;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: "ACTIVE" | "INACTIVE";
};

const CONTENT_TYPES: Array<{ value: SalesContentType; label: string; description: string }> = [
  { value: "homeowner_energy", label: "Huiseigenaar · verduurzaming", description: "Warmtepomp, isolatie en eerste vervolgstap." },
  { value: "vve_collective", label: "VvE of beheerder · collectief", description: "Een voorzichtige eerste inventarisatie." },
  { value: "realtor_linkedin", label: "Makelaar · LinkedIn-concept", description: "Alleen objecten die nu de status GO hebben." },
  { value: "rental_income", label: "Koper of belegger · huurinkomsten", description: "Mogelijkheden voor verbetering, zonder beloftes." },
];
const PARTNER_CATEGORIES: Array<{ value: SalesPartnerCategory; label: string }> = [
  { value: "warmtepompen", label: "Warmtepompen" },
  { value: "airco", label: "Airco" },
  { value: "buy_to_let", label: "Buy-to-Let" },
  { value: "makelaar", label: "Makelaar" },
  { value: "adviseur", label: "Adviseur" },
  { value: "vve", label: "VvE-beheerder of adviseur" },
  { value: "investeerder", label: "Investeerder" },
  { value: "overig", label: "Overig" },
];
const PARTNER_CRM_TYPES: Record<SalesPartnerCategory, CrmContactRecord["type"]> = {
  warmtepompen: "PARTNER",
  airco: "PARTNER",
  buy_to_let: "PARTNER",
  makelaar: "MAKELAAR",
  adviseur: "PARTNER",
  vve: "PARTNER",
  investeerder: "INVESTOR",
  overig: "PARTNER",
};
const emptyPartner = (): PartnerFormValue => ({
  partnerCategory: "warmtepompen",
  name: "",
  company: "",
  email: "",
  phone: "",
  status: "ACTIVE",
});
const inferredPartnerCategory = (contact: CrmContactRecord): SalesPartnerCategory =>
  contact.partnerCategory ?? (contact.type === "INVESTOR" ? "investeerder" : contact.type === "MAKELAAR" ? "makelaar" : "overig");
const dateLabel = (value: string) => new Date(value).toLocaleDateString("nl-NL", { dateStyle: "medium" });
const get = <T,>(url: string) => customFetch<T>(url, { method: "GET" });
const friendlyError = (error: unknown) =>
  error instanceof ApiError && typeof error.data === "object" && error.data !== null && "error" in error.data
    ? String(error.data.error)
    : "De aanvraag is niet gelukt. Probeer het opnieuw.";

function PartnerAdministration() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PartnerFormValue>(emptyPartner);
  const partners = useQuery({
    queryKey: ["crm", "contacts"],
    queryFn: () => get<CrmContactRecord[]>("/api/crm/contacts"),
  });
  const save = useMutation({
    mutationFn: async (value: PartnerFormValue) => {
      const { contactId, ...fields } = value;
      const input = {
        ...fields,
        type: PARTNER_CRM_TYPES[value.partnerCategory],
        company: fields.company.trim(),
        email: fields.email.trim(),
        phone: fields.phone.trim(),
        name: fields.name.trim(),
      };
      return customFetch<CrmContactRecord>(
        contactId ? `/api/crm/contacts/${encodeURIComponent(contactId)}` : "/api/crm/contacts",
        { method: contactId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
      );
    },
    onSuccess: () => {
      setForm(emptyPartner());
      void queryClient.invalidateQueries({ queryKey: ["crm", "contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["sales", "content-options"] });
    },
  });
  const contacts = partners.data ?? [];
  const roster = contacts
    .filter((contact) => Boolean(contact.partnerCategory) || ["PARTNER", "MAKELAAR", "INVESTOR"].includes(contact.type))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  function edit(contact: EditablePartner) {
    setForm({
      contactId: contact.contactId,
      partnerCategory: inferredPartnerCategory(contact),
      name: contact.name,
      company: contact.company ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      status: contact.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9eee6] text-[#607765]"><Handshake size={17} /></span><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-[#68816f]">Partnerregister</p><h2 className="mt-1 text-base font-bold">{form.contactId ? "Partnergegevens bewerken" : "Partner toevoegen"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Opgeslagen als losstaand CRM-contact. Geen leadkoppeling.</p></div></div>
      {partners.isPending ? <div className="mt-5"><LoadingBlock /></div> : partners.isError ? <div className="mt-5"><ErrorBlock message={friendlyError(partners.error)} onRetry={() => void partners.refetch()} /></div> :
        <form className="mt-5 space-y-3" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save.mutate(form); }}>
          <label className="block text-[10px] font-semibold">Expertisegebied
            <select value={form.partnerCategory} onChange={(event) => setForm({ ...form, partnerCategory: event.target.value as SalesPartnerCategory })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-content-partner-category">{PARTNER_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          </label>
          <label className="block text-[10px] font-semibold">Naam *
            <input required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-content-partner-name" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[10px] font-semibold">Organisatie
              <input maxLength={200} value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-content-partner-company" />
            </label>
            <label className="block text-[10px] font-semibold">Telefoon
              <input maxLength={40} autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-content-partner-phone" />
            </label>
          </div>
          <label className="block text-[10px] font-semibold">E-mailadres
            <input type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="input-content-partner-email" />
          </label>
          <label className="block text-[10px] font-semibold">Status
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PartnerFormValue["status"] })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-content-partner-status"><option value="ACTIVE">Actief</option><option value="INACTIVE">Inactief</option></select>
          </label>
          {save.isError && <p className="text-xs text-destructive" role="alert">{friendlyError(save.error)}</p>}
          {save.isSuccess && <p className="text-xs text-[#287b6a]" role="status">Partnergegevens opgeslagen.</p>}
          <button type="submit" disabled={save.isPending} className="min-h-10 w-full rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-60" data-testid="button-save-content-partner">{save.isPending ? "Opslaan…" : form.contactId ? "Wijzigingen opslaan" : "Partner opslaan"}</button>
          {form.contactId && <button type="button" onClick={() => { setForm(emptyPartner()); save.reset(); }} className="min-h-9 w-full rounded-xl border border-border px-4 text-xs font-semibold hover:bg-secondary/50">Bewerken annuleren</button>}
        </form>}
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-[#68816f]">Los van leads</p><h2 className="mt-1 text-base font-bold">Netwerkpartners</h2></div><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold">{roster.length} partners</span></div>
      {roster.length ? <div className="mt-4 space-y-2">{roster.map((contact) => <article key={contact.contactId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3" data-testid={`content-partner-${contact.contactId}`}>
        <div className="min-w-0"><p className="truncate text-xs font-bold">{contact.name}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{contact.partnerCategory ? PARTNER_CATEGORIES.find((category) => category.value === contact.partnerCategory)?.label : "Nog niet ingedeeld"} · {contact.company || contact.email || "Geen organisatiegegevens"}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ${contact.status === "ACTIVE" ? "bg-[#e3f3ee] text-[#207464]" : "bg-secondary text-muted-foreground"}`}>{contact.status === "ACTIVE" && contact.partnerCategory ? "Actief voor aanbevelingen" : contact.status === "ACTIVE" ? "Nog niet ingedeeld" : "Inactief"}</span></div>
        <button type="button" onClick={() => edit(contact)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[10px] font-semibold hover:bg-secondary/50" data-testid={`button-edit-content-partner-${contact.contactId}`}><Pencil size={12} /> Bewerken</button>
      </article>)}</div> : <EmptyBlock title="Nog geen partners geregistreerd" description="Voeg een partner toe en wijs een expertisegebied toe om deze voor passende concepten te kunnen selecteren." />}
    </section>
  </div>;
}

function DraftDialog({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const options = useQuery({
    queryKey: ["sales", "content-options"],
    queryFn: () => get<SalesContentOptions>("/api/sales/content-options"),
    enabled: Boolean(lead),
  });
  const [contentType, setContentType] = useState<SalesContentType>("homeowner_energy");
  const [partnerContactId, setPartnerContactId] = useState("");
  const [dealId, setDealId] = useState("");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const generate = useMutation({
    mutationFn: (input: { leadId: string; contentType: SalesContentType; partnerContactId?: string; dealId?: string }) =>
      customFetch<DraftResult>(`/api/sales/leads/${encodeURIComponent(input.leadId)}/content-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: input.contentType,
          ...(input.partnerContactId ? { partnerContactId: input.partnerContactId } : {}),
          ...(input.dealId ? { dealId: input.dealId } : {}),
        }),
      }),
    onSuccess: (result) => { setDraft(result.draft); setCopied(false); setCopyError(""); },
  });
  const matchingPartners = useMemo(() => {
    const categoryMap: Record<SalesContentType, SalesPartnerCategory[]> = {
      homeowner_energy: ["warmtepompen", "airco", "adviseur"],
      vve_collective: ["vve", "warmtepompen", "adviseur"],
      realtor_linkedin: ["makelaar"],
      rental_income: ["buy_to_let", "investeerder", "adviseur"],
    };
    return (options.data?.partners ?? []).filter((partner) => categoryMap[contentType].includes(partner.category));
  }, [contentType, options.data?.partners]);

  function changeType(value: SalesContentType) {
    setContentType(value);
    setPartnerContactId("");
    setDealId("");
    setDraft("");
    setCopyError("");
    generate.reset();
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopied(false);
      setCopyError("Kopiëren is geblokkeerd. Selecteer en kopieer de tekst handmatig.");
    }
  }

  return <Dialog open={Boolean(lead)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>AI-berichtvoorstel maken</DialogTitle>
        <DialogDescription>Alleen een bewerkbaar concept. Er wordt niets opgeslagen, gemaild of gepubliceerd.</DialogDescription>
      </DialogHeader>
      {lead && <div className="space-y-4">
        <div className="rounded-xl bg-secondary/50 p-3"><p className="text-xs font-bold">{lead.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{lead.company || lead.email} · aanvraag van {dateLabel(lead.createdAt)}</p></div>
        <label className="block text-xs font-semibold">Doelgroep en berichttype
          <select value={contentType} onChange={(event) => changeType(event.target.value as SalesContentType)} className="mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-content-type">{CONTENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">{CONTENT_TYPES.find((option) => option.value === contentType)?.description}</span>
        </label>
        {contentType === "realtor_linkedin" && <label className="block text-xs font-semibold">Deal Room-object met status GO *
          <select value={dealId} onChange={(event) => { setDealId(event.target.value); setDraft(""); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-content-deal"><option value="">Selecteer een object</option>{(options.data?.deals ?? []).map((deal) => <option key={deal.dealId} value={deal.dealId}>{deal.title} · {deal.region}</option>)}</select>
        </label>}
        <label className="block text-xs font-semibold">Passende partner
          <select value={partnerContactId} onChange={(event) => setPartnerContactId(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-xs" data-testid="select-content-partner"><option value="">Geen specifieke partner kiezen</option>{matchingPartners.map((partner) => <option key={partner.contactId} value={partner.contactId}>{partner.name}{partner.company ? ` · ${partner.company}` : ""}</option>)}</select>
          {matchingPartners.length === 0 && <span className="mt-1 block text-[10px] font-normal text-muted-foreground">Er is nog geen actieve partner met passende expertise geregistreerd.</span>}
        </label>
        {options.isError && <p className="text-xs text-destructive" role="alert">{friendlyError(options.error)}</p>}
        <button type="button" disabled={generate.isPending || (contentType === "realtor_linkedin" && (!dealId || options.isPending))} onClick={() => generate.mutate({ leadId: lead.id, contentType, ...(partnerContactId ? { partnerContactId } : {}), ...(dealId ? { dealId } : {}) })} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-55" data-testid={`button-generate-content-${lead.id}`}><Sparkles size={14} />{generate.isPending ? "Bericht wordt gemaakt…" : "Genereer voorstel"}</button>
        {generate.isError && <p className="text-xs text-destructive" role="alert" data-testid="text-content-draft-error">{friendlyError(generate.error)}</p>}
        {draft && <section className="space-y-2 rounded-xl border border-border p-3" aria-label="Bewerkbaar berichtvoorstel">
          {generate.data?.partnerName && <p className="inline-flex items-center gap-1.5 rounded-full bg-[#e3f3ee] px-2.5 py-1 text-[10px] font-semibold text-[#207464]"><Handshake size={11} /> Partneradvies: {generate.data.partnerName}</p>}
          {generate.data?.dealTitle && <p className="text-[10px] text-muted-foreground">Deal Room-object: {generate.data.dealTitle}</p>}
          <Textarea value={draft} onChange={(event) => { setDraft(event.target.value); setCopied(false); setCopyError(""); }} maxLength={6000} rows={8} className="resize-y text-sm leading-6" aria-label="Bewerk het AI-berichtvoorstel" data-testid="textarea-content-draft" />
          <p className="text-[10px] text-muted-foreground">Controleer en bewerk de inhoud voordat je deze gebruikt. Kopiëren verstuurt niets.</p>
          <button type="button" disabled={!draft.trim() || !navigator.clipboard} onClick={() => void copyDraft()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 text-xs font-bold hover:bg-secondary/50 disabled:opacity-50" data-testid="button-copy-content-draft">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Goedgekeurd en gekopieerd" : "Goedkeuren en Kopiëren"}</button>
          {copyError && <p className="text-xs text-destructive" role="alert">{copyError}</p>}
          {!copied && <p className="text-[10px] text-muted-foreground">{navigator.clipboard ? "Kopiëren staat klaar na controle." : "Kopiëren is niet beschikbaar in deze browser."}</p>}
        </section>}
      </div>}
    </DialogContent>
  </Dialog>;
}

function ContentDrafts() {
  const leadsQuery = useQuery({ queryKey: ["sales", "leads"], queryFn: () => get<Lead[]>("/api/sales/leads") });
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  if (leadsQuery.isPending) return <LoadingBlock />;
  if (leadsQuery.isError) return <ErrorBlock message={friendlyError(leadsQuery.error)} onRetry={() => void leadsQuery.refetch()} />;
  const leads = (leadsQuery.data ?? []).slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9eee6] text-[#607765]"><Users size={17} /></span><div><h2 className="text-base font-bold">Recente leads</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Gesorteerd op nieuwste aanvraag. Berichten worden alleen gegenereerd wanneer je ze opvraagt.</p></div></div>
      {leads.length ? <div className="mt-4 divide-y divide-border">{leads.map((lead) => <article key={lead.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center" data-testid={`content-lead-${lead.id}`}>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold">{lead.name}</p><span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold">{lead.status}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{lead.company || lead.email} · {String(lead.metadata?.interest ?? "Interesse niet vastgelegd")}</p><p className="mt-1 text-[10px] text-muted-foreground">{dateLabel(lead.createdAt)} · Score {lead.leadScore}</p></div>
        <button type="button" onClick={() => setSelectedLead(lead)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-3.5 text-[11px] font-bold text-primary-foreground" data-testid={`button-open-content-draft-${lead.id}`}><Sparkles size={13} /> Genereer AI-berichtvoorstel</button>
      </article>)}</div> : <EmptyBlock title="Nog geen leads" description="Nieuwe aanvragen verschijnen hier zodra ze via bestaande formulieren zijn ontvangen." />}
    </section>
    <DraftDialog key={selectedLead?.id ?? "none"} lead={selectedLead} onClose={() => setSelectedLead(null)} />
  </>;
}

export function ContentAutopilot() {
  return <AppShell>
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8">
      <Link href="/control-room" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Terug naar Control Room</Link>
      <SectionHeading eyebrow="Control Room · Sales Engine" title="Contentassistent" description="Maak op verzoek Nederlandse berichtconcepten voor leads en beheer je netwerkpartners." />
      <div className="rounded-xl border border-[#e8dec7] bg-[#fbf6ea] px-4 py-3 text-[11px] leading-5 text-[#705a36]"><span className="inline-flex items-center gap-1.5 font-bold"><Send size={12} /> Alleen concepten</span><p className="mt-1">Er worden geen e-mails verzonden, posts gepubliceerd, campagnes ingepland of berichten opgeslagen. Je controleert, bewerkt en kopieert elk concept zelf.</p></div>
      <Tabs defaultValue="drafts">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="drafts" data-testid="tab-content-drafts"><Sparkles size={14} className="mr-1.5" />Berichtvoorstellen</TabsTrigger>
          <TabsTrigger value="partners" data-testid="tab-content-partners"><Handshake size={14} className="mr-1.5" />Partnerregister</TabsTrigger>
        </TabsList>
        <TabsContent value="drafts" className="mt-5"><ContentDrafts /></TabsContent>
        <TabsContent value="partners" className="mt-5"><PartnerAdministration /></TabsContent>
      </Tabs>
    </div>
  </AppShell>;
}
