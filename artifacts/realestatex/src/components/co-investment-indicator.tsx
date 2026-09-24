import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Handshake, ShieldCheck } from "lucide-react";
import {
  getGetDealCoInvestmentSummaryQueryKey,
  useGetDealCoInvestmentSummary,
  useUpsertDealCoInvestmentCommitment,
} from "@workspace/api-client-react";
import type { InvestorMatch } from "@workspace/api-client-react";
import {
  ErrorBlock,
  LoadingBlock,
  formatEuro,
} from "@/components/ui-elements";

type CoInvestmentIndicatorProps = {
  dealId: string;
  matches: InvestorMatch[];
  matchesLoading: boolean;
};

export function CoInvestmentIndicator({
  dealId,
  matches,
  matchesLoading,
}: CoInvestmentIndicatorProps) {
  const client = useQueryClient();
  const summary = useGetDealCoInvestmentSummary(dealId, {
    query: {
      enabled: Boolean(dealId),
      queryKey: getGetDealCoInvestmentSummaryQueryKey(dealId),
    },
  });
  const upsert = useUpsertDealCoInvestmentCommitment();
  const [investorId, setInvestorId] = useState("");
  const [amount, setAmount] = useState("");
  const currentCommitment = summary.data?.commitments.find(
    (commitment) => commitment.investorId === investorId,
  );

  useEffect(() => {
    if (!investorId && matches.length > 0) {
      setInvestorId(matches[0].investorId);
    }
  }, [investorId, matches]);

  useEffect(() => {
    setAmount(
      currentCommitment ? String(currentCommitment.committedAmount) : "",
    );
  }, [investorId, currentCommitment?.committedAmount]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const committedAmount = Number(amount);
    if (!investorId || !Number.isFinite(committedAmount) || committedAmount < 1) {
      return;
    }
    upsert.mutate(
      {
        dealId,
        investorId,
        data: { committedAmount },
      },
      {
        onSuccess: (result) => {
          client.setQueryData(
            getGetDealCoInvestmentSummaryQueryKey(dealId),
            result,
          );
        },
      },
    );
  };

  const data = summary.data;
  const progress = Math.max(0, Math.min(data?.claimedPercent ?? 0, 100));

  return (
    <section
      className="rounded-2xl border border-[#d7e6e0] bg-[#f5faf7] p-5"
      data-testid={`panel-co-investment-${dealId}`}
      aria-labelledby={`co-investment-heading-${dealId}`}
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#287b6a]">
            Grote transformatie · co-investering
          </p>
          <h4
            id={`co-investment-heading-${dealId}`}
            className="display mt-1 flex items-center gap-2 text-xl font-bold"
          >
            <Handshake size={17} className="text-[#287b6a]" />
            Participatie toegezegd
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Geregistreerde bedragen van matching-investeerders ten opzichte van
            de totale investering.
          </p>
          <p className="mt-1 text-[10px] font-semibold text-[#287b6a]">
            Getoond vanaf een transformatiescore van 70/100.
          </p>
        </div>
        {summary.isLoading ? (
          <div className="w-full max-w-44">
            <LoadingBlock lines={1} />
          </div>
        ) : summary.isError ? (
          <div className="w-full sm:max-w-xs">
            <ErrorBlock onRetry={() => summary.refetch()} />
          </div>
        ) : (
          <div
            className="min-w-36 rounded-xl bg-white/80 px-4 py-3 text-right"
            data-testid={`text-co-investment-percent-${dealId}`}
          >
            <p className="text-[10px] text-muted-foreground">Toegezegd</p>
            <p className="mono mt-1 text-2xl font-medium text-[#287b6a]">
              {(data?.claimedPercent ?? 0).toFixed(1)}%
            </p>
            <p className="mono mt-1 text-[10px] text-muted-foreground">
              {formatEuro(data?.totalCommittedAmount ?? 0)} /{" "}
              {formatEuro(data?.totalInvestment ?? 0)}
            </p>
          </div>
        )}
      </div>

      {!summary.isLoading && !summary.isError && (
        <>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-white"
            role="progressbar"
            aria-label="Aandeel van de investering met geregistreerde toezeggingen"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            data-testid={`progress-co-investment-${dealId}`}
          >
            <div
              className="h-full rounded-full bg-[#287b6a] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <form
              onSubmit={submit}
              className="space-y-3 rounded-xl border border-[#d7e6e0] bg-white/70 p-4"
              data-testid={`form-co-investment-${dealId}`}
            >
              <label className="block text-xs font-semibold">
                Matching-investeerder
                <select
                  value={investorId}
                  onChange={(event) => setInvestorId(event.target.value)}
                  disabled={matchesLoading || matches.length === 0}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                  data-testid={`select-co-investor-${dealId}`}
                >
                  {matches.length === 0 && (
                    <option value="">Geen matching-investeerders</option>
                  )}
                  {matches.map((investor) => (
                    <option key={investor.investorId} value={investor.investorId}>
                      {investor.name} · match {investor.matchScore}/100
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Toegezegd bedrag (€)
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Bijv. 25000"
                  disabled={!investorId || matchesLoading}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                  data-testid={`input-co-investment-amount-${dealId}`}
                />
              </label>
              <button
                type="submit"
                disabled={
                  upsert.isPending ||
                  !investorId ||
                  !amount ||
                  matchesLoading ||
                  matches.length === 0
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#287b6a] px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-[#206758] disabled:cursor-not-allowed disabled:opacity-50"
                data-testid={`button-save-co-investment-${dealId}`}
              >
                <ShieldCheck size={14} />
                {upsert.isPending
                  ? "Registreren..."
                  : currentCommitment
                    ? "Toezegging bijwerken"
                    : "Toezegging registreren"}
              </button>
              {upsert.isError && (
                <p
                  className="text-xs font-semibold text-[#a4443b]"
                  role="alert"
                  data-testid={`status-co-investment-error-${dealId}`}
                >
                  Niet geregistreerd. Controleer het bedrag, de match en de
                  resterende investeringsruimte.
                </p>
              )}
              <p className="text-[10px] leading-4 text-muted-foreground">
                Interne registratie van een toezegging; dit verwerkt geen
                betaling en vormt geen juridisch contract.
              </p>
            </form>

            <div
              className="rounded-xl border border-[#d7e6e0] bg-white/70 p-4"
              data-testid={`list-co-investment-commitments-${dealId}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold">Geregistreerde toezeggingen</p>
                <span className="text-[10px] text-muted-foreground">
                  {data?.commitments.length ?? 0} investeerders
                </span>
              </div>
              {data?.commitments.length ? (
                <ul className="mt-3 space-y-2">
                  {data.commitments.map((commitment) => (
                    <li
                      key={commitment.investorId}
                      className="flex items-center justify-between gap-3 rounded-lg bg-[#f5faf7] px-3 py-2.5"
                      data-testid={`row-co-investment-${commitment.investorId}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">
                          {commitment.investorName}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          Bijgewerkt{" "}
                          {new Date(commitment.updatedAt).toLocaleDateString(
                            "nl-NL",
                          )}
                        </span>
                      </span>
                      <span className="mono shrink-0 text-sm font-medium text-[#287b6a]">
                        {formatEuro(commitment.committedAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-lg bg-[#f5faf7] px-3 py-3 text-xs text-muted-foreground">
                  Nog geen toezeggingen geregistreerd.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}