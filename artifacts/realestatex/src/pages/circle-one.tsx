import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft, Check, Compass, RotateCcw, Snowflake, Sun, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CIRCLE_ONE_HEAT_PUMP_KW, CIRCLE_ONE_MIN_YIELD, calculateCircleOne, circleOneExample, type CircleOneInput } from '@/lib/circle-one';
import { parseCircleOneNumber as parseField } from '@/lib/circle-one-form';

type NumKey = Exclude<keyof CircleOneInput, 'region'>;
type FormValues = { region: CircleOneInput['region'] } & Record<NumKey, string>;

const toForm = (input: CircleOneInput): FormValues => ({
  region: input.region,
  ...(Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'region').map(([k, v]) => [k, String(v)])) as Record<NumKey, string>),
});

type FieldDef = { key: NumKey; label: string; unit: string; hint?: string; integer?: boolean };
const groups: { title: string; caption: string; fields: FieldDef[] }[] = [
  { title: 'Aankoop', caption: 'Geïnstalleerde en bijkomende kosten, zoals jij ze inschat.', fields: [
    { key: 'purchasePrice', label: 'Aankoopprijs', unit: 'EUR' },
    { key: 'acquisitionCosts', label: 'Bijkomende aankoopkosten', unit: 'EUR', hint: 'Overdrachtsbelasting, notaris, makelaar.' },
    { key: 'renovationCosts', label: 'Renovatiekosten', unit: 'EUR' },
  ] },
  { title: 'Verplichte kit', caption: `${CIRCLE_ONE_HEAT_PUMP_KW} kW-warmtepomp en glas-op-glas-PV, precies één keer in de investering. Renovatiekosten zijn exclusief deze kit.`, fields: [
    { key: 'heatPumpCosts', label: `Warmtepomp ${CIRCLE_ONE_HEAT_PUMP_KW} kW, geïnstalleerd`, unit: 'EUR', hint: 'Rekenbaseline; geschiktheid voor het gebouw vereist een installatieberekening.' },
    { key: 'pvCosts', label: 'Glas-glas-PV, geïnstalleerd', unit: 'EUR' },
    { key: 'panelCount', label: 'Aantal panelen', unit: 'st.', integer: true, hint: 'Geheel getal groter dan nul.' },
    { key: 'panelWp', label: 'Vermogen per paneel', unit: 'Wp' },
  ] },
  { title: 'Exploitatie', caption: 'Jaarlijkse eigenaarslasten horen in de operationele kosten.', fields: [
    { key: 'monthlyRent', label: 'Huur per maand', unit: 'EUR' },
    { key: 'vacancyPercent', label: 'Leegstand', unit: '%', hint: 'Tussen 0 en 100.' },
    { key: 'annualOperatingCosts', label: 'Operationele kosten per jaar', unit: 'EUR', hint: 'Onderhoud, VvE, verzekering, eigenaarslasten.' },
  ] },
];
const labelOf = (key: NumKey) => key === 'radiusKm' ? 'Zoekstraal' : key === 'distanceKm' ? 'Afstand tot Gorinchem' : groups.flatMap((g) => g.fields).find((f) => f.key === key)!.label;

const eur = (v: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const eur2 = (v: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const pct = (v: number) => `${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}%`;
const num = (v: number, d = 2) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: d }).format(v);

function Gate({ ok, label, detail, testId }: { ok: boolean; label: string; detail: string; testId: string }) {
  return <div className={`flex items-start gap-3 rounded-xl border p-3.5 ${ok ? 'border-[#9fd8c9] bg-[#e9f6f2]' : 'border-[#efc4bd] bg-[#fbecea]'}`} data-testid={testId}>
    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${ok ? 'bg-[#257d6c] text-white' : 'bg-[#a4443b] text-white'}`}>{ok ? <Check size={14} /> : <X size={14} />}</span>
    <div><p className="text-sm font-bold">{label}: {ok ? 'voldoet' : 'voldoet niet'}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p></div>
  </div>;
}

function Row({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId: string }) {
  return <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? 'border-t border-border font-bold' : ''}`}><span className="text-sm text-muted-foreground">{label}</span><span className="mono text-sm tabular-nums" data-testid={testId}>{value}</span></div>;
}

function NumField({ form, def }: { form: ReturnType<typeof useForm<FormValues>>; def: FieldDef }) {
  return <FormField control={form.control} name={def.key} render={({ field }) => {
    const err = parseField(field.value, def.integer).error;
    const errId = `${def.key}-error`;
    return <FormItem>
      <FormLabel className="text-xs font-semibold">{def.label}</FormLabel>
      <div className={`flex items-center rounded-xl border bg-[#f7f8fa] pr-3 focus-within:ring-2 focus-within:ring-ring ${err ? 'border-destructive' : 'border-input'}`}>
        <FormControl><Input {...field} inputMode={def.integer ? 'numeric' : 'decimal'} autoComplete="off" aria-invalid={Boolean(err)} aria-describedby={err ? errId : undefined} className="mono border-0 bg-transparent shadow-none focus-visible:ring-0" data-testid={`input-${def.key}`} /></FormControl>
        <span className="mono text-[10px] uppercase text-muted-foreground">{def.unit}</span>
      </div>
      {err ? <p id={errId} role="alert" className="text-xs font-medium text-destructive" data-testid={`error-${def.key}`}>{err}</p> : def.hint ? <FormDescription className="text-[11px]">{def.hint}</FormDescription> : null}
    </FormItem>;
  }} />;
}

export function CircleOneCalculator() {
  const form = useForm<FormValues>({ defaultValues: toForm(circleOneExample), mode: 'onChange' });
  const values = useWatch({ control: form.control }) as FormValues;
  const keys = Object.keys(circleOneExample).filter((k) => k !== 'region') as NumKey[];
  const intKeys = new Set<NumKey>(['panelCount']);
  const parsed = keys.map((k) => [k,
    values.region !== 'gorinchem' && (k === 'radiusKm' || k === 'distanceKm')
      ? parseField(String(circleOneExample[k]))
      : parseField(values[k], intKeys.has(k)),
  ] as const);
  const fieldErrors = parsed.filter(([, p]) => p.error);
  const input = fieldErrors.length ? null : ({ region: values.region, ...Object.fromEntries(parsed.map(([k, p]) => [k, p.value])) } as CircleOneInput);
  const result = input ? calculateCircleOne(input) : null;
  const isExample = JSON.stringify(values) === JSON.stringify(toForm(circleOneExample));
  const radius = parseField(values.radiusKm).value;

  return <div className="space-y-6">
    <section className="property-noise relative overflow-hidden rounded-3xl bg-primary px-6 py-7 text-primary-foreground sm:px-9 animate-rise">
      <div className="grid-paper absolute inset-0 opacity-10" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="mono text-[10px] uppercase tracking-[0.2em] text-[#f5b84a]">Drie cirkels / handmatige investeringstoets</p>
          <h2 className="display mt-3 text-3xl font-bold tracking-[-0.05em] sm:text-4xl">Bruto BAR van minimaal {num(CIRCLE_ONE_MIN_YIELD)}%, netto rendement apart.</h2>
          <p className="mt-3 text-sm leading-6 text-primary-foreground/70">Cirkel 1: Gorinchem, 50–60 km. Cirkel 2: Het Gooi/Randstad-transitiezones. Cirkel 3: Vlaanderen. Elke deal bevat een {CIRCLE_ONE_HEAT_PUMP_KW} kW-warmtepomp en glas-op-glas-PV.</p>
        </div>
        <button type="button" onClick={() => form.reset(toForm(circleOneExample))} className="flex items-center gap-2 self-start rounded-xl border border-white/20 px-4 py-2.5 text-xs font-bold hover:bg-white/10 lg:self-auto" data-testid="button-reset-example"><RotateCcw size={14} /> Voorbeeld herstellen</button>
      </div>
    </section>

    <div className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${isExample ? 'border-[#f0d39f] bg-[#fff6e6] text-[#7a4f12]' : 'border-border bg-card text-muted-foreground'}`} data-testid="text-example-notice">
      {isExample ? <><strong>Illustratieve aannames.</strong> De ingevulde waarden zijn een fictief voorbeeld, geen marktdata, offertes of taxatie. Pas ze aan naar jouw eigen deal.</> : <>Eigen scenario op basis van jouw aannames. </>}
      {' '}Niet-aangepaste waarden blijven fictieve voorbeelden, geen offertes. Niets wordt opgeslagen of gedeeld: herladen herstelt het voorbeeld en wist je wijzigingen.
    </div>

    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-5">
          <fieldset className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <legend className="sr-only">Regio</legend>
            <div className="flex items-center gap-2"><Compass size={17} className="text-[#bc741c]" /><h3 className="display text-lg font-bold">Regio</h3></div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Handmatig gekozen. RealEstateX geocodeert niet en verifieert de werkelijke ligging van het object niet.</p>
             <p className="mt-1 text-xs leading-5 text-muted-foreground">Getallen zonder duizendtalscheiding, maximaal 2 decimalen: bijvoorbeeld 1900 of 1900,50.</p>
            <FormField control={form.control} name="region" render={({ field }) => (
              <div role="radiogroup" aria-label="Regio" className="mt-4 grid gap-2 sm:grid-cols-3">
                {([['gorinchem', 'Cirkel 1', 'Gorinchem, binnen 50–60 km'], ['gooi', 'Cirkel 2', 'Het Gooi / Randstad-transitiezones'], ['vlaanderen', 'Cirkel 3', 'Vlaanderen'], ['outside', 'Daarbuiten', 'Geen toegewezen cirkel']] as const).map(([v, l, n]) => (
                  <label key={v} className={`cursor-pointer rounded-xl border p-3 text-left transition-colors focus-within:ring-2 focus-within:ring-ring ${field.value === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>
                    <input type="radio" name={field.name} value={v} checked={field.value === v} onChange={() => field.onChange(v)} className="sr-only" data-testid={`radio-region-${v}`} />
                    <span className="block text-sm font-bold">{l}</span><span className={`block text-[11px] ${field.value === v ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>{n}</span>
                  </label>
                ))}
              </div>
            )} />
            {values.region === 'gorinchem' && <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <NumField form={form} def={{ key: 'radiusKm', label: 'Zoekstraal', unit: 'km', hint: `Instelbaar van 50 tot 60 km. Alles op of binnen ${radius !== undefined ? num(radius) : '…'} km telt mee.` }} />
              <NumField form={form} def={{ key: 'distanceKm', label: 'Afstand tot Gorinchem (hemelsbreed)', unit: 'km', hint: 'Door jou opgegeven, niet geverifieerd.' }} />
            </div>}
            {values.region !== 'gorinchem' && <p className="mt-4 text-[11px] text-muted-foreground">Straal en afstand blijven bewaard maar tellen niet mee voor {values.region === 'gooi' ? 'Het Gooi' : 'deze keuze'}.</p>}
          </fieldset>
          {groups.map((g) => <fieldset key={g.title} className="rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid={`fieldset-${g.title.toLowerCase().replace(/\s/g, '-')}`}>
            <legend className="sr-only">{g.title}</legend>
            <div className="flex items-center gap-2">{g.title === 'Verplichte kit' ? <><Snowflake size={16} className="text-[#257d6c]" /><Sun size={16} className="text-[#bc741c]" /></> : null}<h3 className="display text-lg font-bold">{g.title}</h3></div>
            <p className="mt-1 text-xs text-muted-foreground">{g.caption}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{g.fields.map((f) => <NumField key={f.key} form={form} def={f} />)}</div>
          </fieldset>)}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start" aria-live="polite">
          {!result || !result.valid ? <div className="rounded-2xl border border-[#efc4bd] bg-card p-5" role="alert" data-testid="status-invalid">
            <div className="flex items-center gap-2 text-[#a4443b]"><AlertTriangle size={17} /><h3 className="font-bold">Geen uitkomst bij ongeldige invoer</h3></div>
            <p className="mt-2 text-xs text-muted-foreground">Er worden geen eerdere resultaten getoond. Herstel het volgende:</p>
            <ul className="mt-3 space-y-1.5 text-sm" data-testid="list-errors">
              {fieldErrors.map(([k, p]) => <li key={k}><strong>{labelOf(k)}</strong>: {p.error}</li>)}
              {result && !result.valid && result.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div> : (() => {
            const r = result;
            const nearBoundary = pct(r.grossYieldPercent) === pct(CIRCLE_ONE_MIN_YIELD);
            return <>
              <div className={`rounded-2xl p-5 ${r.eligible ? 'bg-[#1f4f46] text-white' : 'bg-[#5a2621] text-white'}`} data-testid="status-qualification">
                <p className="mono text-[10px] uppercase tracking-[0.2em] opacity-70">Uitkomst {r.circle ? `Cirkel ${r.circle}` : 'buiten de cirkels'}</p>
                <p className="display mt-2 text-3xl font-bold tracking-[-0.04em]" data-testid="text-qualifies">{r.eligible ? 'Kwalificeert' : 'Kwalificeert niet'}</p>
                <p className="mt-3 text-xs opacity-75">Bruto BAR</p>
                <p className="display text-5xl font-bold tracking-[-0.06em]" data-testid="text-gross-yield">{pct(r.grossYieldPercent)}</p>
                {nearBoundary && <p className="mt-2 text-xs opacity-80" data-testid="text-rounding-note">Afgerond lijkt dit gelijk aan {num(CIRCLE_ONE_MIN_YIELD)}%. De beslissing gebruikt het onafgeronde bedrag ({r.yieldEligible ? 'net wel' : 'net niet'} gehaald).</p>}
              </div>
              <Gate ok={r.regionEligible} label="Regio" testId="status-region-gate" detail={r.circle ? `Cirkel ${r.circle}. Handmatige regio-invoer, niet geografisch geverifieerd.` : 'Buiten de drie cirkels of buiten de opgegeven Gorinchem-straal.'} />
              <Gate ok={r.yieldEligible} label={`Bruto BAR minimaal ${num(CIRCLE_ONE_MIN_YIELD)}%`} testId="status-yield-gate" detail="Getoetst op het exacte, onafgeronde cijfer. Geen WWS- of juridische goedkeuring." />
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-[11px] text-muted-foreground">Totale investering</p><p className="display text-xl font-bold" data-testid="text-total-investment">{eur(r.totalInvestment)}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Netto jaarinkomen</p><p className="display text-xl font-bold" data-testid="text-net-income">{eur(r.netAnnualRent)}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Netto huurrendement (apart)</p><p className="display text-xl font-bold" data-testid="text-net-yield">{pct(r.netYieldPercent)}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Huur nodig voor {num(CIRCLE_ONE_MIN_YIELD)}%</p><p className="display text-xl font-bold" data-testid="text-required-rent">{r.requiredMonthlyRent === null ? 'Niet te bepalen' : `${eur2(r.requiredMonthlyRent)} p/m`}</p></div>
                </div>
                {r.requiredMonthlyRent === null && <p className="mt-2 text-[11px] text-muted-foreground">Bij 100% leegstand levert geen enkele huur inkomen op.</p>}
                 {r.requiredMonthlyRent !== null && <p className="mt-2 text-[11px] text-muted-foreground">Benodigde huur naar boven afgerond op centen.</p>}
              </div>
              <div className="rounded-2xl border border-border bg-card p-5" data-testid="section-breakdown">
                <h3 className="display font-bold">Opbouw</h3>
                <p className="mono mt-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Investering</p>
                <Row label="Aankoopprijs" value={eur(input!.purchasePrice)} testId="text-breakdown-purchase" />
                <Row label="Bijkomende kosten" value={eur(input!.acquisitionCosts)} testId="text-breakdown-acquisition" />
                <Row label="Renovatie" value={eur(input!.renovationCosts)} testId="text-breakdown-renovation" />
                <Row label={`Kit: warmtepomp ${CIRCLE_ONE_HEAT_PUMP_KW} kW + glas-op-glas-PV (${num(r.pvKwp)} kWp)`} value={eur(r.kitInvestment)} testId="text-breakdown-kit" />
                <Row label="Totale investering" value={eur(r.totalInvestment)} strong testId="text-breakdown-total" />
                <p className="text-[11px] text-muted-foreground">PV: {num(input!.panelCount, 0)} panelen x {num(input!.panelWp)} Wp = <span data-testid="text-pv-kwp">{num(r.pvKwp)} kWp</span>. De kit telt één keer mee.</p>
                <p className="mono mt-4 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Inkomen</p>
                <Row label="Brutohuur (maand x 12)" value={eur(r.grossAnnualRent)} testId="text-breakdown-gross-rent" />
                <Row label={`Leegstand (${num(input!.vacancyPercent)}%)`} value={`- ${eur(r.vacancyLoss)}`} testId="text-breakdown-vacancy" />
                <Row label="Effectieve huur" value={eur(r.effectiveAnnualRent)} testId="text-breakdown-effective" />
                <Row label="Operationele kosten" value={`- ${eur(input!.annualOperatingCosts)}`} testId="text-breakdown-opex" />
                <Row label="Netto jaarhuur" value={eur(r.netAnnualRent)} strong testId="text-breakdown-net" />
                <div className="mt-4 space-y-2 rounded-xl bg-muted p-3 text-[11px] leading-5 text-muted-foreground">
                  <p><strong className="text-foreground">Netto huurrendement</strong> = netto jaarhuur / totale investering x 100. Netto jaarhuur = maandhuur x 12 na leegstand, min jaarlijkse operationele kosten.</p>
                  <p><strong className="text-foreground">Bruto BAR</strong> = brutohuur zonder leegstand en kosten / totale investering x 100; de harde ondergrens is 7,5%.</p>
                  <p>Niet inbegrepen: financiering, inkomsten- of vermogensbelasting, energiebesparing, subsidies, energielabel- of WWS-puntenstijging. Kosten zijn door jou ingevoerde geïnstalleerde bedragen.</p>
                </div>
              </div>
            </>;
          })()}
        </aside>
      </form>
    </Form>
  </div>;
}

export function CircleOne() {
  useEffect(() => { document.title = 'Cirkel 1 | RealEstateX'; }, []);
  return <AppShell><CircleOneCalculator /></AppShell>;
}

export function CircleOnePreview() {
  useEffect(() => { document.title = 'Cirkel 1 preview | RealEstateX'; }, []);
  return <div className="min-h-[100dvh] bg-background text-foreground">
    <header className="border-b border-border/70 bg-background/90 px-5 sm:px-8">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between">
        <Link href="/" className="font-bold tracking-[-0.04em]" data-testid="link-preview-brand">RealEstate<span className="text-[#bc741c]">X</span></Link>
        <Link href="/" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid="link-preview-back"><ArrowLeft size={14} /> Terug</Link>
      </div>
    </header>
    <main className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8"><CircleOneCalculator /></main>
  </div>;
}
