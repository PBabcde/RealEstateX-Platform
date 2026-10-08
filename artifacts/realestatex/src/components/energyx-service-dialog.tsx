import { useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

type RequestKind = 'service' | 'maintenance';

export function EnergyxServiceDialog({
  initialKind, address, pending, requestId, error, onClose, onSubmit,
}: {
  initialKind: RequestKind;
  address: string;
  pending: boolean;
  requestId?: string;
  error: boolean;
  onClose: () => void;
  onSubmit: (payload: { kind: RequestKind; note: string }) => void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [note, setNote] = useState('');
  const triggerRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pending) onSubmit({ kind, note: note.trim() });
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent
      className="max-w-md rounded-2xl bg-card"
      data-testid="dialog-energyx-service"
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (triggerRef.current?.isConnected) triggerRef.current.focus();
      }}
    >
      <DialogTitle>{requestId ? 'Aanvraag ontvangen' : 'Service of onderhoud aanvragen'}</DialogTitle>
      <DialogDescription>{address}</DialogDescription>
      {requestId ? <div className="space-y-4" data-testid="energyx-service-confirmation" role="status">
        <div className="rounded-xl bg-[#e3f3ee] p-4 text-[#207464]">
          <CheckCircle2 size={28} className="mb-2" />
          <p className="text-sm font-bold">Je verzoek is geregistreerd.</p>
          <p className="mt-1 text-xs leading-5">Referentie: {requestId}</p>
          <p className="mt-2 text-xs leading-5">Dit is een interne registratie in RealEstateX. Er wordt nog niets naar een EnergyX-installateur verstuurd.</p>
        </div>
        <button onClick={onClose} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground" data-testid="button-energyx-service-done">Gereed</button>
      </div> : <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs font-bold">Type aanvraag
          <select value={kind} onChange={(event) => setKind(event.target.value as RequestKind)} disabled={pending} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid="select-energyx-service-kind">
            <option value="service">Service / advies</option>
            <option value="maintenance">Onderhoud</option>
          </select>
        </label>
        <label className="block text-xs font-bold">Toelichting (optioneel)
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={4} disabled={pending} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal" placeholder="Beschrijf je vraag of het probleem…" data-testid="textarea-energyx-service-note" />
        </label>
        <p className="text-[11px] text-muted-foreground">Je verzoek wordt intern geregistreerd. De live verzending naar EnergyX is nog niet aangesloten.</p>
        {error && <p className="text-xs text-[#a4443b]" role="alert">De aanvraag kon niet worden geregistreerd. Je toelichting is behouden; probeer het opnieuw.</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-xl border border-border px-4 py-3 text-xs font-bold disabled:opacity-50">Annuleren</button>
          <button type="submit" disabled={pending} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-energyx-service-submit">{pending && <Loader2 size={14} className="animate-spin" />}{pending ? 'Registreren…' : 'Aanvraag indienen'}</button>
        </div>
      </form>}
    </DialogContent>
  </Dialog>;
}
