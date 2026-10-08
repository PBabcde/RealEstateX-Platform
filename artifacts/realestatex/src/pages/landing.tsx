import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Calculator, Leaf, Sparkles } from 'lucide-react';
import { LeadCaptureDialog } from '@/components/lead-capture-dialog';

const SITE_URL = 'https://realestatex.nl';
const TITLE = 'RealEstateX — vastgoedanalyse, WWS-rendement en transformatie';
const DESCRIPTION = 'Analyseer vastgoed met WWS-puntentelling, rendement en transformatiescenario’s. Privé en beschermd, met een Property Transformer voor foto-naar-plan concepten.';

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
  { icon: Calculator, title: 'WWS & rendement', text: 'Bereken punten, maximale huur en rendement op je objecten.' },
  { icon: Sparkles, title: 'Property Transformer', text: 'Van foto naar renovatieconcept, met je data lokaal in je browser.' },
  { icon: Leaf, title: 'Energie & verduurzaming', text: 'Zie wat energielabel en verduurzaming doen voor de waarde van je pand.' },
];

export function Landing() {
  useCanonical();
  const [leadOpen, setLeadOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-3 font-bold tracking-[-0.04em]"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="RealEstateX" className="h-8" /></span>
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link href="/sign-in" data-testid="button-login">Aanmelden</Link>
          <Link href="/sign-up" className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid="link-signup">Account aanmaken</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-16">
        <section className="py-14 sm:py-20">
          <h1 className="display max-w-3xl text-4xl font-bold tracking-[-0.06em] sm:text-5xl">Vastgoedbeslissingen op basis van cijfers, privé en beschermd.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{DESCRIPTION}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button ref={opener} onClick={() => setLeadOpen(true)} className="rounded-xl bg-primary px-5 py-3 text-xs font-bold text-primary-foreground" data-testid="button-open-lead">Vraag het volledige vastgoed- en energierapport aan</button>
            <Link href="/sign-in" className="rounded-xl border border-border px-5 py-3 text-xs font-bold hover:bg-secondary">Naar mijn werkruimte</Link>
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
      </main>
      {leadOpen && <LeadCaptureDialog source="landing-report" returnFocusTarget={opener.current} onClose={() => setLeadOpen(false)} />}
    </div>
  );
}
