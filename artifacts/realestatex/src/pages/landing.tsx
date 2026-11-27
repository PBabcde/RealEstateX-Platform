import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'wouter';
import { Calculator, Globe2, Leaf, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { LeadCaptureDialog } from '@/components/lead-capture-dialog';

const SITE_URL = 'https://realestatex.nl';
const TITLE = 'RealEstateX — vastgoedanalyse, rendement en transformatie';
const DESCRIPTION = 'Beoordeel vastgoedinvesteringen met transparante aannames: rendement, handmatige WWS-indicaties en transformatiescenario’s. Privé en beschermd, met een Property Transformer voor foto-naar-plan concepten.';

export function useCanonical() {
  useEffect(() => {
    document.title = TITLE;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    // Query strings and fragments never belong in the canonical URL.
    link.href = `${SITE_URL}${window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/'}`;
  }, []);
}

const features = [
  { icon: Calculator, title: 'Rendement & WWS-indicatie', text: 'Reken rendement door en leg zelf een WWS-indicatie vast. Geen officiële of geverifieerde WWS-berekening.' },
  { icon: Sparkles, title: 'Property Transformer', text: 'Van foto naar renovatieconcept, met je data lokaal in je browser.' },
  { icon: Leaf, title: 'Energie & verduurzaming', text: 'Zie wat energielabel en verduurzaming doen voor de waarde van je pand.' },
];

export function Landing() {
  useCanonical();
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSource, setLeadSource] = useState('public_report_unlock');
  const [leadTitle, setLeadTitle] = useState('Ontvang het volledige vastgoed- en energierapport');
  const [leadIntro, setLeadIntro] = useState('Laat je e-mailadres achter om meer informatie over RealEstateX te ontvangen.');
  const [leadInterest, setLeadInterest] = useState('Vastgoed- en energierapport');
  const opener = useRef<HTMLButtonElement>(null);
  const lastOpener = useRef<HTMLElement | null>(null);
  const openLead = (event: MouseEvent<HTMLElement>, source: string, title: string, intro: string, interest: string) => {
    lastOpener.current = event.currentTarget;
    setLeadSource(source);
    setLeadTitle(title);
    setLeadIntro(intro);
    setLeadInterest(interest);
    setLeadOpen(true);
  };
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-3 font-bold tracking-[-0.04em]"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="RealEstateX" className="h-8" /></span>
        <nav className="flex items-center gap-4 text-sm font-semibold" aria-label="Account">
          <Link href="/sign-in" data-testid="button-login">Aanmelden</Link>
          <Link href="/sign-up" className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid="link-signup">Account aanmaken</Link>
        </nav>
      </header>
      <nav aria-label="Publieke tools" className="mx-auto max-w-5xl px-5" data-testid="nav-public">
        <ul className="flex gap-2 overflow-x-auto pb-1 text-xs font-semibold text-muted-foreground">
          <li><Link href="/calculators" className="block whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 hover:text-foreground" data-testid="nav-link-calculators">Rekentools</Link></li>
          <li><Link href="/cirkel-1/preview" className="block whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 hover:text-foreground" data-testid="nav-link-circle-one-preview">Cirkel 1 preview</Link></li>
          <li><Link href="/innovation-center" className="block whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 hover:text-foreground" data-testid="nav-link-innovation-center">Innovation Center</Link></li>
        </ul>
      </nav>
      <main className="mx-auto max-w-5xl px-5 pb-16">
        <section className="py-14 sm:py-20">
          <h1 className="display max-w-3xl text-4xl font-bold tracking-[-0.06em] sm:text-5xl">Vastgoedbeslissingen op basis van cijfers, privé en beschermd.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{DESCRIPTION}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button ref={opener} onClick={(event) => openLead(event, 'public_report_unlock', 'Ontvang het volledige vastgoed- en energierapport', 'Laat je e-mailadres achter; naam en interessegebied zijn optioneel.', 'Vastgoed- en energierapport')} className="rounded-xl bg-primary px-5 py-3 text-xs font-bold text-primary-foreground" data-testid="button-open-lead">Ontvang het volledige vastgoed- en energierapport</button>
            <Link href="/sign-in" className="rounded-xl border border-border px-5 py-3 text-xs font-bold hover:bg-secondary">Naar mijn werkruimte</Link>
            <Link href="/calculators" className="rounded-xl border border-border px-5 py-3 text-xs font-bold hover:bg-secondary" data-testid="link-home-calculators">Rekentools zonder account</Link>
            <Link href="/cirkel-1/preview" className="rounded-xl border border-border px-5 py-3 text-xs font-bold hover:bg-secondary" data-testid="link-home-circle-one-preview">Cirkel 1 proberen zonder account</Link>
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-3" aria-label="Mogelijkheden">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6">
              <Icon size={20} className="text-[#c17b21]" />
              <h2 className="display mt-4 text-lg font-bold tracking-[-0.04em]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
        <section className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_.85fr]" aria-label="Rapport en Catch of the Day">
          <article className="overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid="section-public-report-preview">
            <div className="flex items-start justify-between gap-4"><div><p className="mono text-[10px] uppercase tracking-[0.16em] text-[#287b6a]">Rapportvoorbeeld</p><h2 className="display mt-2 text-xl font-bold">Een voorproefje van je vastgoedrapport</h2></div><TrendingUp size={19} className="shrink-0 text-[#287b6a]" /></div>
            <div className="relative mt-5 overflow-hidden rounded-xl border border-[#dce5e1] bg-[#f3f7f4] p-4">
              <div className="grid gap-3 blur-[5px] select-none sm:grid-cols-3" aria-hidden="true">
                <div className="rounded-lg bg-white p-3"><p className="text-[10px] text-muted-foreground">Huurreturn</p><p className="mono mt-2 text-2xl font-bold">7,8%</p></div>
                <div className="rounded-lg bg-white p-3"><p className="text-[10px] text-muted-foreground">Energiebeeld</p><p className="mono mt-2 text-lg font-bold">Scenario</p></div>
                <div className="rounded-lg bg-white p-3"><p className="text-[10px] text-muted-foreground">WWS (handmatig)</p><p className="mono mt-2 text-lg font-bold">Indicatie</p></div>
              </div>
              <p className="mt-3 text-[10px] leading-4 text-muted-foreground">Illustratief voorbeeld; geen taxatie, offerte of officiële WWS-uitkomst. WWS-punten worden nu handmatig ingevoerd; er is nog geen geverifieerde WWS-formule.</p>
            </div>
            <button onClick={(event) => openLead(event, 'public_report_unlock', 'Ontvang het volledige vastgoedrapport', 'Je ontvangt bericht over de beschikbare rapportage. Je e-mailadres is voldoende.', 'Rapportontgrendeling')} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground" data-testid="button-report-unlock"><Zap size={14} /> Ontvang meer informatie</button>
            <p className="mt-3 text-[10px] leading-5 text-muted-foreground">Vrijwillige bijdrage? Met de Innovation Button kun je RealEstateX helpen verbeteren. Dit is vrijblijvend en verwerkt geen betaling.</p>
            <button onClick={(event) => openLead(event, 'voluntary_contribution', 'Draag vrijwillig bij aan RealEstateX', 'Laat je e-mailadres achter als je wilt meedenken of helpen. Er wordt geen betaling gevraagd.', 'Vrijwillige bijdrage')} className="mt-2 text-xs font-semibold text-[#287b6a] underline underline-offset-4" data-testid="button-innovation-contribution">Ik wil vrijwillig bijdragen</button>
          </article>
          <article className="rounded-2xl border border-[#e4d8c2] bg-[#f7f1e6] p-5 sm:p-7" data-testid="section-catch-of-the-day-teaser">
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8b704b]">Binnenkort · Catch of the Day</p>
            <h2 className="display mt-2 text-xl font-bold">Een kans om rustig te beoordelen</h2>
            <p className="mt-3 text-sm leading-6 text-[#76674f]">De publieke teaser is voorbereid. Er wordt nog geen object automatisch geselecteerd of als live kans aangeboden.</p>
            <button onClick={(event) => openLead(event, 'catch_of_the_day', 'Ontvang bericht over Catch of the Day', 'We laten je weten wanneer er een openbare preview beschikbaar is.', 'Catch of the Day')} className="mt-5 rounded-xl border border-[#d8c9ad] bg-white/70 px-4 py-3 text-xs font-bold text-[#654f31] hover:bg-white" data-testid="button-catch-interest">Houd mij op de hoogte</button>
          </article>
        </section>
        <section className="mt-5 rounded-2xl border border-[#d8e3dc] bg-[#f2f6f1] p-5 sm:p-7" aria-labelledby="international-opportunities-title" data-testid="section-international-opportunities">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="mono text-[10px] uppercase tracking-[0.16em] text-[#58745f]">Try-out · demo data</p><h2 id="international-opportunities-title" className="display mt-2 text-2xl font-bold tracking-[-0.04em]">International Opportunities (Try-out — English)</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">Three illustrative demo examples, not live offers. Each is scored on four pillars: Location, Facade/Curb Appeal, Permit Greenlight and Yield & Energy ROI. Always verify locally.</p></div>
            <Globe2 size={20} className="text-[#58745f]" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              { country: 'Spain', area: 'Valencia region', scores: ['Location · Demo 4/5', 'Facade/Curb Appeal · Demo 3/5', 'Permit Greenlight · Verify locally', 'Yield & Energy ROI · Verify locally'] },
              { country: 'Portugal', area: 'Porto region', scores: ['Location · Demo 3/5', 'Facade/Curb Appeal · Demo 4/5', 'Permit Greenlight · Verify locally', 'Yield & Energy ROI · Verify locally'] },
              { country: 'Panama', area: 'Panama City', scores: ['Location · Demo 3/5', 'Facade/Curb Appeal · Demo 3/5', 'Permit Greenlight · Verify locally', 'Yield & Energy ROI · Verify locally'] },
            ].map((item) => <article key={item.country} className="rounded-xl border border-[#d7e2d8] bg-white/70 p-4" data-testid={`card-international-${item.country.toLowerCase()}`}>
              <p className="text-sm font-bold">{item.country}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.area} · sample territory only</p>
              <ul className="mt-3 space-y-1.5 text-[10px] leading-4 text-[#58695d]">{item.scores.map((score) => <li key={score}>{score}</li>)}</ul>
            </article>)}
          </div>
          <button onClick={(event) => openLead(event, 'international_opportunities', 'Get notified about international opportunities', 'Leave your email to hear when verified international opportunities become available. Name and interest are optional.', 'International Opportunities')} className="mt-4 rounded-xl bg-[#315c45] px-4 py-3 text-xs font-bold text-white hover:bg-[#264b39]" data-testid="button-international-interest">Notify me about new international opportunities</button>
        </section>
        <section className="mt-5 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7" aria-labelledby="community-title" data-testid="section-community-partner">
          <div><p className="mono text-[10px] uppercase tracking-[0.16em] text-[#287b6a]">Innovation Center</p><h2 id="community-title" className="display mt-2 text-xl font-bold">Denk mee of werk samen</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Doe mee aan de bètacommunity, of laat weten dat je als makelaar, adviseur of financier wilt samenwerken. Alleen je e-mailadres is nodig. <Link href="/innovation-center" className="font-semibold text-[#287b6a] underline underline-offset-4" data-testid="link-community-innovation-center">Bekijk het Innovation Center</Link></p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={(event) => openLead(event, 'beta_community', 'Doe mee aan de bètacommunity', 'Test nieuwe onderdelen en geef feedback. Je e-mailadres is voldoende.', 'Bètacommunity')} className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground" data-testid="button-beta-community">Bètacommunity</button>
            <button onClick={(event) => openLead(event, 'partner_interest', 'Interesse in samenwerking', 'Laat je e-mailadres achter; we nemen contact op over mogelijke samenwerking.', 'Partnerschap')} className="rounded-xl border border-border px-4 py-3 text-xs font-bold hover:bg-secondary" data-testid="button-partner-interest">Partner worden</button>
          </div>
        </section>
      </main>
      {leadOpen && <LeadCaptureDialog source={leadSource} title={leadTitle} intro={leadIntro} defaultInterest={leadInterest} returnFocusTarget={lastOpener.current ?? opener.current} onClose={() => setLeadOpen(false)} />}
    </div>
  );
}
