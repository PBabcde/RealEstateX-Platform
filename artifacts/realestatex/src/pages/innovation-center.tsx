import { zodResolver } from '@hookform/resolvers/zod';
import { useUser } from '@clerk/react';
import { useCreateCrmContact, getListCrmContactsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, CircleHelp, Lightbulb, LoaderCircle, MessageSquareText, Network, ShieldCheck, UsersRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { AppShell } from '@/components/app-shell';

const contributionTypes = [
  { value: 'Idee', label: 'Een nieuw idee' },
  { value: 'Suggestie', label: 'Een suggestie' },
  { value: 'Probleem melden', label: 'Een probleem melden' },
  { value: 'Verbeteringsvoorstel', label: 'Een verbetering voorstellen' },
] as const;

const categories = [
  'Nieuwe functie',
  'Verbetering',
  'AI idee',
  'Vastgoedanalyse',
  'Energie',
  'Gebruikservaring',
] as const;

const priorities = [
  { value: 'Laag', note: 'Goed om mee te nemen' },
  { value: 'Normaal', note: 'Maakt echt verschil' },
  { value: 'Hoog', note: 'Belangrijk voor mijn werk' },
] as const;

const innovationSchema = z.object({
  name: z.string().trim().min(2, 'Vul je naam in.').max(120, 'Gebruik maximaal 120 tekens.'),
  email: z.union([z.literal(''), z.string().trim().email('Vul een geldig e-mailadres in.')]),
  contributionType: z.enum(['Idee', 'Suggestie', 'Probleem melden', 'Verbeteringsvoorstel']),
  category: z.enum(categories, { required_error: 'Kies een categorie.' }),
  priority: z.enum(['Laag', 'Normaal', 'Hoog']),
  title: z.string().trim().min(4, 'Geef je bijdrage een korte titel.').max(140, 'Gebruik maximaal 140 tekens.'),
  details: z.string().trim().min(20, 'Vertel iets meer; minimaal 20 tekens.').max(4000, 'Gebruik maximaal 4.000 tekens.'),
  betaInterest: z.boolean(),
  partnerInterest: z.boolean(),
  consent: z.boolean().refine((value) => value, 'Geef toestemming voordat je je bijdrage verstuurt.'),
});

type InnovationFormValues = z.infer<typeof innovationSchema>;

const initialFormValues: InnovationFormValues = {
  name: '',
  email: '',
  contributionType: 'Idee',
  category: 'Nieuwe functie',
  priority: 'Normaal',
  title: '',
  details: '',
  betaInterest: false,
  partnerInterest: false,
  consent: false,
};

function FieldShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border/80 bg-background/75 p-4 transition-colors focus-within:border-primary/40 ${className}`}>{children}</div>;
}

export function InnovationCenter() {
  const { isLoaded, user } = useUser();
  const queryClient = useQueryClient();
  const createContact = useCreateCrmContact();
  const [submitted, setSubmitted] = useState(false);
  const [requestError, setRequestError] = useState(false);

  const form = useForm<InnovationFormValues>({
    resolver: zodResolver(innovationSchema),
    defaultValues: initialFormValues,
    mode: 'onTouched',
  });

  useEffect(() => {
    if (!isLoaded || !user) return;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    form.reset({
      ...initialFormValues,
      name,
      email: user.primaryEmailAddress?.emailAddress ?? '',
    });
  }, [form, isLoaded, user]);

  const onSubmit = (values: InnovationFormValues) => {
    setSubmitted(false);
    setRequestError(false);
    const consentedAt = new Date().toISOString();
    const notes = [
      'RealEstateX Innovation Center',
      `Bijdragetype: ${values.contributionType}`,
      `Categorie: ${values.category}`,
      `Prioriteit: ${values.priority}`,
      `Idee/titel: ${values.title.trim()}`,
      `Toelichting: ${values.details.trim()}`,
      `Beta-tester / early-adopter interesse: ${values.betaInterest ? 'Ja' : 'Nee'}`,
      `Partnerinteresse: ${values.partnerInterest ? 'Ja' : 'Nee'}`,
      `Toestemming contactgegevens: Ja`,
      `Toestemming vastgelegd op: ${consentedAt}`,
    ].join('\n\n');

    createContact.mutate(
      {
        data: {
          type: 'PARTNER',
          name: values.name.trim(),
          ...(values.email.trim() ? { email: values.email.trim() } : {}),
          company: 'Innovation Center',
          status: 'ACTIVE',
          notes,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListCrmContactsQueryKey() });
          form.reset({ ...initialFormValues, name: '', email: '' });
          setSubmitted(true);
        },
        onError: () => setRequestError(true),
      },
    );
  };

  return (
    <AppShell>
    <div className="animate-rise space-y-7 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-[#d8e4e2] bg-[#eaf2ef] px-6 py-8 sm:px-9 sm:py-10 lg:px-12">
        <div className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full border border-[#bdd2cb]/70" />
        <div className="pointer-events-none absolute -right-2 -top-12 h-48 w-48 rounded-full border border-[#bdd2cb]/60" />
        <div className="relative grid items-end gap-8 lg:grid-cols-[1fr_280px]">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#c8dbd4] bg-[#f8fbf9] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#287b6a]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#287b6a]" />
              Samen bouwen aan vastgoed
            </div>
            <h2 className="display max-w-2xl text-3xl font-bold leading-[1.08] tracking-[-0.05em] text-[#182b40] sm:text-5xl">
              Jouw ervaring maakt RealEstateX beter.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#526579] sm:text-base">
              RealEstateX ontwikkelen we samen met de mensen die ermee werken. Deel wat je mist,
              wat beter kan of waar je tegenaan loopt — van vastgoedeigenaar tot adviseur.
            </p>
          </div>
          <div className="hidden rounded-2xl border border-[#c8dbd4] bg-[#f8fbf9]/80 p-5 lg:block">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#dcebe5] text-[#287b6a]"><Lightbulb size={19} /></div>
              <div>
                <p className="mono text-[10px] uppercase tracking-[0.15em] text-[#668279]">Open uitnodiging</p>
                <p className="mt-1 text-sm font-bold text-[#182b40]">Van inzicht naar impact</p>
              </div>
            </div>
            <div className="space-y-3 text-xs text-[#526579]">
              <p className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#287b6a]" /> Geen idee is te klein om te delen.</p>
              <p className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#287b6a]" /> Je bijdrage komt bij ons team terecht.</p>
              <p className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#287b6a]" /> Je bepaalt zelf of we contact opnemen.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="rounded-[26px] border border-border/80 bg-card p-5 shadow-sm sm:p-8">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#287b6a]">Jouw bijdrage</p>
              <h3 className="display mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">Waar kunnen we mee aan de slag?</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Omschrijf je idee of ervaring. Een helder voorbeeld helpt ons om de juiste verbetering te maken.</p>
            </div>
            <div className="hidden h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary sm:grid"><MessageSquareText size={20} /></div>
          </div>

          {submitted && (
            <div className="mb-6 flex gap-3 rounded-2xl border border-[#b9d9cc] bg-[#eef7f2] p-4 text-[#245f50]" role="status" data-testid="status-submission-success">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d9eee3]"><Check size={17} /></div>
              <div>
                <p className="text-sm font-bold">Bedankt voor het meedenken.</p>
                <p className="mt-1 text-xs leading-5">Je bijdrage is ontvangen en staat bij ons team. We nemen contact op als je daar toestemming voor hebt gegeven en je gegevens hebt achtergelaten.</p>
              </div>
            </div>
          )}

          {requestError && (
            <div className="mb-6 flex gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-destructive" role="alert" data-testid="status-submission-error">
              <CircleHelp size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold">Versturen is niet gelukt.</p>
                <p className="mt-1 text-xs leading-5">Je gegevens zijn niet bevestigd. Controleer je verbinding en probeer het opnieuw; je ingevulde bijdrage blijft bewaard.</p>
              </div>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="contributionType" render={({ field }) => (
                  <FormItem>
                    <FieldShell>
                      <FormLabel className="text-xs font-bold text-foreground">Wat wil je delen?</FormLabel>
                      <FormControl>
                        <select {...field} data-testid="select-contribution-type" className="mt-2 w-full bg-transparent text-sm font-semibold text-foreground outline-none">
                          {contributionTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      </FormControl>
                    </FieldShell>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FieldShell>
                      <FormLabel className="text-xs font-bold text-foreground">Onderwerp</FormLabel>
                      <FormControl>
                        <select {...field} data-testid="select-category" className="mt-2 w-full bg-transparent text-sm font-semibold text-foreground outline-none">
                          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </FormControl>
                    </FieldShell>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FieldShell>
                    <FormLabel className="text-xs font-bold text-foreground">Korte titel</FormLabel>
                    <FormControl><input {...field} data-testid="input-idea-title" placeholder="Bijvoorbeeld: sneller inzicht in verduurzamingskosten" className="mt-2 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70" /></FormControl>
                    <FormDescription>Een korte omschrijving maakt je bijdrage makkelijker terug te vinden.</FormDescription>
                  </FieldShell>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="details" render={({ field }) => (
                <FormItem>
                  <FieldShell>
                    <FormLabel className="text-xs font-bold text-foreground">Vertel er iets meer over</FormLabel>
                    <FormControl><textarea {...field} data-testid="textarea-idea-details" rows={5} placeholder="Wat probeer je te bereiken? Wat gebeurt er nu, en wat zou jou helpen?" className="mt-2 w-full resize-y bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/70" /></FormControl>
                    <div className="flex items-center justify-between gap-3">
                      <FormDescription>Beschrijf gerust een concrete situatie.</FormDescription>
                      <span className="mono text-[10px] text-muted-foreground">{form.watch('details').length}/4000</span>
                    </div>
                  </FieldShell>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="priority" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-foreground">Hoe belangrijk is dit voor jou?</FormLabel>
                  <FormControl>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {priorities.map((priority) => (
                        <label key={priority.value} className={`cursor-pointer rounded-2xl border p-3 transition-colors ${field.value === priority.value ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:bg-secondary/60'}`}>
                          <input {...field} type="radio" value={priority.value} checked={field.value === priority.value} data-testid={`radio-priority-${priority.value.toLowerCase()}`} className="sr-only" />
                          <span className="block text-sm font-bold text-foreground">{priority.value}</span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">{priority.note}</span>
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
                <FormField control={form.control} name="betaInterest" render={({ field }) => (
                  <FormItem>
                    <label className="flex h-full cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background p-4 transition-colors hover:bg-secondary/50">
                      <FormControl><input type="checkbox" checked={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} name={field.name} data-testid="checkbox-beta-interest" className="mt-1 h-4 w-4 accent-[#287b6a]" /></FormControl>
                      <span><span className="block text-sm font-bold text-foreground">Ik wil beta-tester / early adopter zijn</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Laat het weten als ik nieuwe onderdelen vroeg kan uitproberen.</span></span>
                    </label>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="partnerInterest" render={({ field }) => (
                  <FormItem>
                    <label className="flex h-full cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background p-4 transition-colors hover:bg-secondary/50">
                      <FormControl><input type="checkbox" checked={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} name={field.name} data-testid="checkbox-partner-interest" className="mt-1 h-4 w-4 accent-[#287b6a]" /></FormControl>
                      <span><span className="block text-sm font-bold text-foreground">Ik wil praten over samenwerken</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Ik vertegenwoordig een organisatie of werk als professional.</span></span>
                    </label>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FieldShell>
                      <FormLabel className="text-xs font-bold text-foreground">Naam</FormLabel>
                      <FormControl><input {...field} data-testid="input-name" autoComplete="name" placeholder="Je naam" className="mt-2 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70" /></FormControl>
                    </FieldShell>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FieldShell>
                      <FormLabel className="text-xs font-bold text-foreground">E-mailadres <span className="font-normal text-muted-foreground">(optioneel)</span></FormLabel>
                      <FormControl><input {...field} type="email" data-testid="input-email" autoComplete="email" placeholder="naam@voorbeeld.nl" className="mt-2 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70" /></FormControl>
                    </FieldShell>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="consent" render={({ field }) => (
                <FormItem>
                  <div className="rounded-2xl border border-[#d5e3de] bg-[#f5f9f7] p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <FormControl><input type="checkbox" checked={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} name={field.name} data-testid="checkbox-consent" className="mt-1 h-4 w-4 accent-[#287b6a]" /></FormControl>
                      <span className="text-xs leading-5 text-[#405b53]">Ik geef RealEstateX toestemming om mijn naam en eventueel e-mailadres te bewaren bij deze bijdrage, zodat het team mijn input kan opvolgen. <span className="font-bold">Dit is nodig om te versturen.</span></span>
                    </label>
                    <FormMessage className="pl-7" />
                  </div>
                </FormItem>
              )} />

              <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck size={15} className="shrink-0 text-[#287b6a]" /> Je gegevens worden als contact met je bijdrage in ons bestaande CRM opgeslagen.</p>
                <button type="submit" disabled={createContact.isPending} data-testid="button-submit-innovation" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0">
                  {createContact.isPending ? <><LoaderCircle size={16} className="animate-spin" /> Versturen…</> : <>Bijdrage versturen <ArrowRight size={16} /></>}
                </button>
              </div>
              {createContact.isPending && <div className="skeleton h-1.5 overflow-hidden rounded-full" role="status" aria-label="Bijdrage wordt verstuurd" data-testid="status-submission-loading" />}
            </form>
          </Form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[26px] border border-border/80 bg-card p-5 sm:p-6">
            <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[#e8f1ed] text-[#287b6a]"><Network size={19} /></div>
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#287b6a]">Samenwerking</p>
            <h3 className="display mt-2 text-xl font-bold tracking-[-0.04em]">Meer dan feedback</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">We verkennen graag hoe RealEstateX kan aansluiten op de praktijk en expertise van partners.</p>
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              {['Vastgoedprofessionals', 'Adviseurs', 'Installateurs', 'Investeerders', 'Innovatieve partners'].map((audience) => (
                <div key={audience} className="flex items-center gap-2.5 text-xs font-semibold text-foreground" data-testid={`text-partner-audience-${audience.toLowerCase().replaceAll(' ', '-')}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#287b6a]" />{audience}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[26px] bg-[#243b53] p-5 text-white sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-[#f0b45e]"><UsersRound size={19} /></div>
              <p className="mono text-[10px] uppercase tracking-[0.16em] text-white/60">Vanuit de praktijk</p>
            </div>
            <h3 className="display text-xl font-bold tracking-[-0.04em]">Gebouwd mét de vastgoedwereld.</h3>
            <p className="mt-3 text-sm leading-6 text-white/70">Een beter product ontstaat wanneer eigenaren, professionals, adviseurs, installateurs en investeerders hun kennis delen.</p>
          </section>

          <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-secondary/60 p-4">
            <CircleHelp size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-5 text-muted-foreground" data-testid="text-contact-optional">Een e-mailadres is niet verplicht. Zonder e-mailadres kunnen we je bijdrage wel bewaren, maar niet persoonlijk opvolgen.</p>
          </div>
        </aside>
      </div>
    </div>
    </AppShell>
  );
}

export default InnovationCenter;
