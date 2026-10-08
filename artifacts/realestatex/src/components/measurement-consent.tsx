import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { setMeasurementConsent, trackPageView, useMeasurementConsent } from '@/lib/measurement';

export function TrafficTracker() {
  const [location] = useLocation();
  const consent = useMeasurementConsent();
  useEffect(() => {
    if (consent === 'granted' && !location.startsWith('/sign-')) trackPageView(location);
  }, [location, consent]);
  return null;
}

export function MeasurementConsentBanner() {
  const consent = useMeasurementConsent();
  if (consent !== 'unset') return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-border bg-card p-4 shadow-2xl" role="region" aria-label="Meetinstemming" data-testid="banner-measurement-consent">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted-foreground">
          We meten anoniem welke pagina’s en tools worden bezocht (geen advertentiecookies, IP-adres alleen als dagelijks wisselende hash). Mag dat?
        </p>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setMeasurementConsent('denied')} className="rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-secondary" data-testid="button-consent-deny">Niet meten</button>
          <button onClick={() => setMeasurementConsent('granted')} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" data-testid="button-consent-accept">Akkoord</button>
        </div>
      </div>
    </div>
  );
}
