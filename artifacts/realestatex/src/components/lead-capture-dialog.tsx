import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, customFetch } from '@workspace/api-client-react';
import { X } from 'lucide-react';

export function LeadCaptureDialog({ source, returnFocusTarget, onClose }: { source: string; returnFocusTarget: HTMLElement | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    nameRef.current?.focus();
    return () => {
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus();
    };
  }, [returnFocusTarget]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [href]')).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      await customFetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          phone: form.get('phone'),
          company: form.get('company'),
          interest: form.get('interest'),
          website: form.get('website'),
          consent: form.get('consent') === 'on',
          source,
        }),
      });
      setDone(true);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.data && typeof (caught.data as { error?: unknown }).error === 'string'
        ? (caught.data as { error: string }).error
        : 'Je aanvraag kon niet worden verstuurd. Probeer het later opnieuw.');
    } finally {
      setPending(false);
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#1c2739]/65 p-4 backdrop-blur-sm" data-testid="dialog-lead-capture">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="lead-capture-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="lead-capture-title" className="display text-xl font-bold tracking-[-0.04em]">Vraag het volledige vastgoed- en energierapport aan</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Laat je gegevens achter; we nemen contact met je op over een rapport voor jouw pand.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Sluiten" data-testid="button-lead-close"><X size={18} /></button>
        </div>
        {done ? (
          <div className="mt-6" role="status" data-testid="status-lead-saved">
            <p className="text-sm font-bold text-[#287b6a]">Bedankt! Je aanvraag is ontvangen.</p>
            <button onClick={onClose} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground">Sluiten</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <label className="block text-xs font-semibold">Naam *<input ref={nameRef} name="name" required maxLength={200} autoComplete="name" className={field} data-testid="input-lead-name" /></label>
            <label className="block text-xs font-semibold">E-mailadres *<input name="email" type="email" required maxLength={254} autoComplete="email" className={field} data-testid="input-lead-email" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold">Telefoon<input name="phone" maxLength={40} autoComplete="tel" className={field} data-testid="input-lead-phone" /></label>
              <label className="block text-xs font-semibold">Bedrijf<input name="company" maxLength={200} autoComplete="organization" className={field} data-testid="input-lead-company" /></label>
            </div>
            <label className="block text-xs font-semibold">Waar ben je naar op zoek?<input name="interest" maxLength={120} className={field} data-testid="input-lead-interest" /></label>
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
            <label className="flex items-start gap-3 text-xs leading-5"><input name="consent" type="checkbox" required className="mt-1 h-4 w-4 accent-[#243b53]" data-testid="checkbox-lead-consent" /><span>Ik geef toestemming dat RealEstateX mijn gegevens opslaat om contact met mij op te nemen over dit rapport (AVG). Je kunt deze toestemming altijd laten intrekken.</span></label>
            {error && <p className="text-xs font-semibold text-[#a4443b]" role="alert" data-testid="text-lead-error">{error}</p>}
            <button disabled={pending} className="w-full rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground disabled:opacity-60" data-testid="button-lead-submit">{pending ? 'Versturen…' : 'Aanvraag versturen'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
