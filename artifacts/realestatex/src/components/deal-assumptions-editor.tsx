import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateDeal, getGetDealQueryKey, getListDealsQueryKey, type DealRecord } from "@workspace/api-client-react";
import { InvestmentFields } from "./investment-fields";

export function DealAssumptionsEditor({ deal }: { deal: DealRecord }) {
  const [value, setValue] = useState(deal.investmentAssumptions);
  const [saved, setSaved] = useState(false);
  const update = useUpdateDeal();
  const client = useQueryClient();
  const save = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    update.mutate({ dealId: deal.dealId, data: { investmentAssumptions: value } }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getGetDealQueryKey(deal.dealId) });
        void client.invalidateQueries({ queryKey: getListDealsQueryKey() });
        setSaved(true);
      },
    });
  };
  return <details className="rounded-xl border border-border p-3">
    <summary className="cursor-pointer text-xs font-bold">Investeringsaannames aanvullen of corrigeren</summary>
    <form onSubmit={save}>
      <InvestmentFields value={value} onChange={next => { setValue(next); setSaved(false); }} />
      <button disabled={update.isPending} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Opslaan en opnieuw toetsen</button>
      {saved && <p role="status" className="mt-2 text-xs">Opgeslagen en opnieuw getoetst.</p>}
      {update.isError && <p role="alert" className="mt-2 text-xs text-destructive">Opslaan mislukt. Je invoer blijft behouden.</p>}
    </form>
  </details>;
}
