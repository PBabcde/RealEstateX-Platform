import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, type EnergyXRenovationScenario, type EnergyXRenovationScenarioInput, type EnergyXRenovationScenarioList } from '@workspace/api-client-react';
import { Check, LoaderCircle } from 'lucide-react';

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card shadow-[0_9px_30px_rgba(51,59,76,.05)]">{children}</section>;
}

function CardHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="border-b border-border/70 px-5 py-5 sm:px-6">
    <p className="mono text-[9px] uppercase tracking-[.18em] text-[#a95f39]">{eyebrow}</p>
    <h2 className="display mt-1.5 text-xl font-bold tracking-[-0.05em]">{title}</h2>
    <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">{detail}</p>
  </div>;
}

const request = <T,>(url: string, body?: unknown) => customFetch<T>(
  url,
  body === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(body) },
);

function euro(value: number | null | undefined): string {
  return value == null
    ? 'Niet beschikbaar'
    : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function ScenarioRow({ scenario }: { scenario: EnergyXRenovationScenario }) {
  return <tr className="border-t border-border/70 text-xs" data-testid={`energyx-scenario-${scenario.id}`}>
    <th scope="row" className="py-3 pr-3 text-left font-bold">
      <span className="block">{scenario.title}</span>
      <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
        {new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium' }).format(new Date(scenario.createdAt))}
      </span>
    </th>
    <td className="py-3 pr-3">{scenario.energyLabel ?? 'Niet beschikbaar'}</td>
    <td className="mono py-3 pr-3">{scenario.wwsScore == null ? 'Niet beschikbaar' : scenario.wwsScore}</td>
    <td className="mono py-3 text-right">{euro(scenario.maxRentEur)}</td>
  </tr>;
}

export function EnergyXScenarioHistory({ accountId, projectId, projectName }: { accountId: string; projectId: string; projectName: string }) {
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [energyLabel, setEnergyLabel] = useState('');
  const [wwsScore, setWwsScore] = useState('');
  const [maxRent, setMaxRent] = useState('');
  const queryKey = ['energyx-renovation-scenarios', accountId, projectId];
  const scenarios = useQuery({
    queryKey,
    queryFn: () => request<EnergyXRenovationScenarioList>(
      `/api/energyx/renovation-scenarios?projectId=${encodeURIComponent(projectId)}`,
    ),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const save = useMutation({
    mutationFn: (payload: EnergyXRenovationScenarioInput) =>
      request<EnergyXRenovationScenario>('/api/energyx/renovation-scenarios', payload),
    onSuccess: async () => {
      setTitle('');
      setEnergyLabel('');
      setWwsScore('');
      setMaxRent('');
      await client.invalidateQueries({ queryKey });
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hasResult = Boolean(energyLabel.trim() || wwsScore.trim() || maxRent.trim());
    if (!hasResult) return;
    save.mutate({
      projectId,
      title: title.trim() || `Resultaat ${new Intl.DateTimeFormat('nl-NL', { dateStyle: 'short' }).format(new Date())}`,
      energyLabel: energyLabel.trim() || null,
      wwsScore: wwsScore.trim() ? Number(wwsScore) : null,
      maxRentEur: maxRent.trim() ? Number(maxRent) : null,
    });
  };

  return <Card>
    <CardHeader eyebrow="EnergyX · historie" title="Eerdere resultaten vergelijken" detail={`Bewaar en vergelijk de waarden die voor ${projectName || 'dit project'} door EnergyX zijn teruggegeven.`} />
    <div className="space-y-5 p-5 sm:p-6">
      <p className="rounded-xl bg-[#f7eddd] px-3 py-2.5 text-[11px] leading-5 text-[#7a5413]">
        RealEstateX bewaart de ingevulde uitkomst, maar berekent geen energielabel, officiële WWS-score of maximale huur. Resultaten blijven één jaar beschikbaar.
      </p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" data-testid="form-save-energyx-scenario">
        <label className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground sm:col-span-2">
          Naam van deze optie
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Bijvoorbeeld: isolatie en warmtepomp" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-foreground" data-testid="input-energyx-scenario-title" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">
          Energielabel
          <input value={energyLabel} onChange={(event) => setEnergyLabel(event.target.value)} maxLength={20} placeholder="Bijvoorbeeld B" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-foreground" data-testid="input-energyx-scenario-label" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">
          WWS-score
          <input value={wwsScore} onChange={(event) => setWwsScore(event.target.value)} type="number" min="0" max="1000" step="0.1" placeholder="Punten" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-foreground" data-testid="input-energyx-scenario-wws" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground sm:col-span-2">
          Maximale maandhuur (€)
          <input value={maxRent} onChange={(event) => setMaxRent(event.target.value)} type="number" min="0" max="100000" step="1" placeholder="Bedrag per maand" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-foreground" data-testid="input-energyx-scenario-rent" />
        </label>
        {!energyLabel.trim() && !wwsScore.trim() && !maxRent.trim() && <p className="text-[10px] text-muted-foreground sm:col-span-2">Vul ten minste één door EnergyX teruggegeven waarde in.</p>}
        {save.isError && <p className="text-xs text-[#a4443b]" role="alert" data-testid="status-energyx-scenario-save-error">Het resultaat kon niet worden bewaard. Controleer de waarden en probeer opnieuw.</p>}
        {save.isSuccess && <p className="flex items-center gap-1.5 text-xs font-semibold text-[#287b6a]" role="status"><Check size={13} /> Resultaat bewaard.</p>}
        <button type="submit" disabled={save.isPending || !energyLabel.trim() && !wwsScore.trim() && !maxRent.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#24324b] px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2 sm:justify-self-start" data-testid="button-save-energyx-scenario">
          {save.isPending && <LoaderCircle size={14} className="animate-spin" />}
          {save.isPending ? 'Bewaren…' : 'EnergyX-resultaat bewaren'}
        </button>
      </form>

      <div>
        <h3 className="text-xs font-bold">Opgeslagen opties</h3>
        {scenarios.isLoading ? <p className="py-4 text-xs text-muted-foreground" role="status">Resultaten laden…</p>
          : scenarios.isError ? <div className="mt-3 rounded-lg bg-[#fff1ee] px-3 py-2.5 text-xs text-[#9e4336]" role="alert">
            De eerdere resultaten konden niet worden geladen. Controleer je verbinding en probeer het opnieuw.
            <button onClick={() => void scenarios.refetch()} className="ml-2 font-bold underline">Opnieuw laden</button>
          </div>
            : scenarios.data?.scenarios.length ? <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[540px] border-collapse text-left">
                <thead><tr className="text-[9px] uppercase tracking-[.1em] text-muted-foreground"><th className="pb-2 pr-3">Optie</th><th className="pb-2 pr-3">Label</th><th className="pb-2 pr-3">WWS-punten</th><th className="pb-2 text-right">Max. huur / mnd</th></tr></thead>
                <tbody>{scenarios.data.scenarios.map((scenario) => <ScenarioRow key={scenario.id} scenario={scenario} />)}</tbody>
              </table>
            </div> : <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-4 text-xs leading-5 text-muted-foreground" role="status" data-testid="empty-energyx-scenarios">
              Er zijn nog geen beschikbare opties voor dit project. Bewaar hier de cijfers die EnergyX teruggeeft.
            </p>}
        {scenarios.data && scenarios.data.expiredCount > 0 && <p className="mt-3 rounded-lg bg-[#faeedc] px-3 py-2.5 text-[11px] leading-5 text-[#7a5413]" role="status" data-testid="status-expired-energyx-scenarios">
          {scenarios.data.expiredCount} ouder resultaat {scenarios.data.expiredCount === 1 ? 'is verlopen' : 'zijn verlopen'} en wordt niet meer getoond. Vraag EnergyX om de cijfers opnieuw te berekenen en bewaar de uitkomst opnieuw.
        </p>}
        <p className="mt-2 text-[10px] text-muted-foreground">Alleen jij kunt deze projectresultaten openen. Ze verlopen {scenarios.data?.retentionDays ?? 365} dagen na opslaan.</p>
      </div>
    </div>
  </Card>;
}
